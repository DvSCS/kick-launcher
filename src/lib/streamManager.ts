/* eslint-disable @typescript-eslint/no-explicit-any */
import ffmpeg from 'fluent-ffmpeg';
import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

// Force the path relative to process.cwd() to bypass Next.js/Turbopack string replacement issues
const ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

export interface PlaylistItem {
  id?: string;
  type?: 'url' | 'file';
  url: string;
  durationMs?: number; 
  isLoop?: boolean; 
}

export interface Preset {
  id: string;
  name: string;
  actionOnEnd: 'loop' | 'next' | 'stop';
  items: PlaylistItem[];
}

export interface OverlayItem {
  id: string;
  type: 'text' | 'media' | 'clock' | 'marquee' | 'box' | 'blur';
  text?: string;
  mediaUrl?: string;
  x: string | number;
  y: string | number;
  color?: string;
  fontsize?: string | number;
  width?: string | number;
  height?: string | number;
  opacity?: number;
  hasShadow?: boolean;
  shadowColor?: string;
  shadowX?: number | string;
  shadowY?: number | string;
  hasBorder?: boolean;
  borderColor?: string;
  borderWidth?: number | string;
  hasBackground?: boolean;
  backgroundColor?: string;
  backgroundPadding?: number | string;
  blurAmount?: number;
  marqueeSpeed?: number;
}

interface GlobalFilters {
  brightness: number;
  contrast: number;
  saturation: number;
}

interface StreamConfig {
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  isFreeCameraEnabled?: boolean;
  baseMediaTransform?: { x: number; y: number; w: number; h: number; rotation: number };
}

let activeCommand: ffmpeg.FfmpegCommand | null = null;
let isStreaming = false;
let currentPlaylist: PlaylistItem[] = [];
let currentPlaylistIndex = 0;
let _presets: Preset[] = [];
let _activePresetId = '';
let playlistTimeout: NodeJS.Timeout | null = null;

let _streamUrl = '';
let _streamKey = '';
let _onEnd: () => void = () => {};
let _onError: (err: any) => void = () => {};
let _overlayItems: OverlayItem[] = [];
let _globalFilters: GlobalFilters = { brightness: 0, contrast: 1, saturation: 1 };
let _config: StreamConfig = { canvasWidth: 1920, canvasHeight: 1080, fps: 30, videoBitrate: 3000, audioBitrate: 160 };

export const streamManager = {
  startStream: (
    presets: Preset[], 
    activePresetId: string,
    streamUrl: string, 
    streamKey: string, 
    overlayItems: OverlayItem[],
    globalFilters: GlobalFilters,
    config: StreamConfig,
    onEnd: () => void, 
    onError: (err: any) => void
  ) => {
    if (isStreaming) {
      throw new Error("Já existe uma transmissão em andamento.");
    }
    
    _presets = presets || [];
    _activePresetId = activePresetId;
    _globalFilters = globalFilters || { brightness: 0, contrast: 1, saturation: 1 };
    _config = config || { canvasWidth: 1920, canvasHeight: 1080, fps: 30, videoBitrate: 3000, audioBitrate: 160 };

    const initialPreset = _presets.find(p => p.id === _activePresetId);
    if (!initialPreset || initialPreset.items.length === 0) {
      throw new Error("O Preset ativo não possui mídias.");
    }

    _streamUrl = streamUrl;
    _streamKey = streamKey;
    _overlayItems = overlayItems || [];
    _onEnd = onEnd;
    _onError = onError;
    
    currentPlaylist = initialPreset.items;
    currentPlaylistIndex = 0;
    isStreaming = true;

    streamManager.playNextItem();
  },

  playNextItem: () => {
    if (playlistTimeout) {
      clearTimeout(playlistTimeout);
      playlistTimeout = null;
    }

    if (currentPlaylistIndex >= currentPlaylist.length) {
      const activePreset = _presets.find(p => p.id === _activePresetId);
      const action = activePreset ? activePreset.actionOnEnd : 'stop';
      
      console.log(`Playlist do preset '${activePreset ? activePreset.name : 'Desconhecido'}' terminada. Ação configurada: ${action}`);

      if (action === 'loop') {
        currentPlaylistIndex = 0;
      } else if (action === 'next') {
        const currentIndex = _presets.findIndex(p => p.id === _activePresetId);
        const nextPreset = _presets[currentIndex + 1];
        if (nextPreset && nextPreset.items.length > 0) {
          console.log(`Avançando para o próximo preset: ${nextPreset.name}`);
          _activePresetId = nextPreset.id;
          currentPlaylist = nextPreset.items;
          currentPlaylistIndex = 0;
        } else {
          console.log('Não há próximo preset ou ele está vazio. Encerrando transmissão.');
          isStreaming = false;
          _onEnd();
          return;
        }
      } else {
        // stop
        isStreaming = false;
        _onEnd();
        return;
      }
    }

    const item = currentPlaylist[currentPlaylistIndex];
    console.log(`Iniciando item da playlist [${currentPlaylistIndex + 1}/${currentPlaylist.length}]: ${item.url}`);

    let cleanStreamUrl = _streamUrl.endsWith('/') ? _streamUrl.slice(0, -1) : _streamUrl;
    if (!cleanStreamUrl.endsWith('/app')) {
      cleanStreamUrl += '/app';
    }
    const cleanStreamKey = _streamKey.startsWith('/') ? _streamKey.slice(1) : _streamKey;
    const targetUrl = `${cleanStreamUrl}/${cleanStreamKey}`;
    
    const isHls = item.url.includes('.m3u8') || item.url.includes('.m3u');
    const isVod = item.url.includes('/movie/') || item.url.includes('/series/') || item.url.endsWith('.mp4') || item.url.endsWith('.mkv');
    
    const inputOptions = item.isLoop 
      ? ['-re', '-stream_loop', '-1'] 
      : [
          ...(isVod ? ['-re'] : []),
          '-reconnect', '1', 
          '-reconnect_streamed', '1', 
          '-reconnect_delay_max', '5',
          '-reconnect_on_network_error', '1',
          '-reconnect_on_http_error', '4xx,5xx',
          ...(isHls ? ['-live_start_index', '-1'] : []),
          '-user_agent', 'Mozilla/5.0'
        ];

    activeCommand = ffmpeg(item.url)
      .inputOptions(inputOptions);

    const filters: ffmpeg.FilterSpecification[] = [];
    let lastVideoMap = '0:v';

    // --- Base Media (Scale / Rotate / Background) ---
    if (_config.isFreeCameraEnabled && _config.baseMediaTransform) {
      const transform = _config.baseMediaTransform;
      
      filters.push({
        filter: 'scale',
        options: `${transform.w}:${transform.h}`,
        inputs: '0:v',
        outputs: 'base_scaled_step1'
      });
      let currentOut = 'base_scaled_step1';

      if (transform.rotation !== 0) {
        filters.push({
          filter: 'rotate',
          options: `${transform.rotation}*PI/180:c=none`,
          inputs: currentOut,
          outputs: 'base_rotated'
        });
        currentOut = 'base_rotated';
      }

      filters.push({
        filter: 'color',
        options: `c=black:s=${_config.canvasWidth}x${_config.canvasHeight}`,
        outputs: 'bg_canvas'
      });

      filters.push({
        filter: 'overlay',
        options: `x=${transform.x}:y=${transform.y}`,
        inputs: ['bg_canvas', currentOut],
        outputs: 'base_scaled'
      });
      lastVideoMap = 'base_scaled';
      
    } else {
      if (_overlayItems.length > 0 || _globalFilters.brightness !== 0 || _globalFilters.contrast !== 1 || _globalFilters.saturation !== 1) {
         filters.push({
            filter: 'scale',
            options: `${_config.canvasWidth}:${_config.canvasHeight}`,
            inputs: '0:v',
            outputs: 'base_scaled'
         });
         lastVideoMap = 'base_scaled';
      }
    }   
       const b = _globalFilters.brightness || 0;
       const c = _globalFilters.contrast !== undefined ? _globalFilters.contrast : 1;
       const s = _globalFilters.saturation !== undefined ? _globalFilters.saturation : 1;
       
       if (b !== 0 || c !== 1 || s !== 1) {
          filters.push({
             filter: 'eq',
             options: `brightness=${b}:contrast=${c}:saturation=${s}`,
             inputs: lastVideoMap,
             outputs: 'base_video'
          });
          lastVideoMap = 'base_video';
       }

    let inputIndex = 1; // 0 é o video principal

    const applyOpacity = (hexOrNamedColor: string, opacitySlider?: number) => {
       if (opacitySlider === undefined || opacitySlider === 100) return hexOrNamedColor;
       const alpha = opacitySlider / 100;
       return `${hexOrNamedColor}@${alpha}`;
    };

    const injectTextEffects = (overlay: any, opts: any) => {
       opts.fontcolor = applyOpacity(overlay.color || 'white', overlay.opacity);

       if (overlay.hasShadow && (overlay.shadowX || overlay.shadowY)) {
          opts.shadowcolor = applyOpacity(overlay.shadowColor || 'black', overlay.opacity);
          opts.shadowx = overlay.shadowX || '0';
          opts.shadowy = overlay.shadowY || '0';
       }
       if (overlay.hasBorder && overlay.borderWidth && overlay.borderWidth > 0) {
          opts.bordercolor = applyOpacity(overlay.borderColor || 'black', overlay.opacity);
          opts.borderw = overlay.borderWidth;
       }
       if (overlay.hasBackground) {
          opts.box = 1;
          opts.boxcolor = applyOpacity(overlay.backgroundColor || 'black', overlay.opacity);
          opts.boxborderw = overlay.backgroundPadding || 0;
       }
    };

    for (let i = 0; i < _overlayItems.length; i++) {
       const overlay = _overlayItems[i];
       
       if (overlay.type === 'media' && overlay.mediaUrl) {
           activeCommand.input(overlay.mediaUrl);
           activeCommand.inputOptions(['-stream_loop', '-1']);
           
           const w = overlay.width ? overlay.width : '200';
           const h = overlay.height && overlay.height !== '' ? overlay.height : '-1';
           
           filters.push({
              filter: 'scale',
              options: `${w}:${h}`,
              inputs: `${inputIndex}:v`,
              outputs: `ovrl_scaled_${i}`
           });

           filters.push({
              filter: 'overlay',
              options: { x: overlay.x, y: overlay.y, shortest: 0 },
              inputs: [lastVideoMap, `ovrl_scaled_${i}`],
              outputs: `mix_${i}`
           });

           lastVideoMap = `mix_${i}`;
           inputIndex++;

       } else if (overlay.type === 'text' && overlay.text) {
           const text = overlay.text.replace(/:/g, '\\:');
           const drawtextOpts: any = {
             text: text,
             fontsize: overlay.fontsize || '48',
             x: overlay.x,
             y: overlay.y
           };
           injectTextEffects(overlay, drawtextOpts);
           filters.push({
              filter: 'drawtext',
              options: drawtextOpts,
              inputs: lastVideoMap,
              outputs: `mix_${i}`
           });
           lastVideoMap = `mix_${i}`;

       } else if (overlay.type === 'clock') {
           const drawtextOpts: any = {
             text: '%H\\\\:%M\\\\:%S',
             expansion: 'strftime',
             fontsize: overlay.fontsize || '48',
             x: overlay.x,
             y: overlay.y
           };
           injectTextEffects(overlay, drawtextOpts);
           filters.push({
              filter: 'drawtext',
              options: drawtextOpts,
              inputs: lastVideoMap,
              outputs: `mix_${i}`
           });
           lastVideoMap = `mix_${i}`;

       } else if (overlay.type === 'marquee' && overlay.text) {
           const text = overlay.text.replace(/:/g, '\\:');
           const speed = overlay.marqueeSpeed || 50;
           const drawtextOpts: any = {
             text: text,
             fontsize: overlay.fontsize || '48',
             y: overlay.y,
             x: `w-mod(t*${speed}\\,w+tw)` // Scroll math
           };
           injectTextEffects(overlay, drawtextOpts);
           filters.push({
              filter: 'drawtext',
              options: drawtextOpts,
              inputs: lastVideoMap,
              outputs: `mix_${i}`
           });
           lastVideoMap = `mix_${i}`;

       } else if (overlay.type === 'box') {
           const w = overlay.width || '200';
           const h = overlay.height || '100';
           
           let c = overlay.color || 'black@0.5';
           if (overlay.opacity !== undefined && overlay.opacity !== 100) {
              const baseColor = c.split('@')[0];
              c = `${baseColor}@${overlay.opacity / 100}`;
           }

           filters.push({
              filter: 'drawbox',
              options: {
                x: overlay.x,
                y: overlay.y,
                w: w,
                h: h,
                color: c,
                t: 'fill'
              },
              inputs: lastVideoMap,
              outputs: `mix_${i}`
           });
           lastVideoMap = `mix_${i}`;

       } else if (overlay.type === 'blur') {
           const blurAmount = overlay.blurAmount || 10;
           const croppedName = `cropped_blur_${i}`;
           const blurredName = `blurred_${i}`;
           
           filters.push({
              filter: 'crop',
              options: `${overlay.width || 100}:${overlay.height || 100}:${overlay.x}:${overlay.y}`,
              inputs: lastVideoMap,
              outputs: croppedName
           });
           filters.push({
              filter: 'boxblur',
              options: `${blurAmount}`,
              inputs: croppedName,
              outputs: blurredName
           });
           filters.push({
              filter: 'overlay',
              options: `x=${overlay.x}:y=${overlay.y}`,
              inputs: [lastVideoMap, blurredName],
              outputs: `mix_${i}`
           });
           lastVideoMap = `mix_${i}`;
       }
    }

    if (filters.length > 0) {
       activeCommand.complexFilter(filters, [lastVideoMap]);
       activeCommand.outputOptions(['-map', '0:a']); // Mapeia o áudio original separadamente
    } else {
       // Se não tem overlays, pelo menos garante o rescale? Opcional. 
       // Se não tem filtros, o fluent-ffmpeg cuida do map por padrão.
    }

    activeCommand.outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-profile:v main',
        `-b:v ${_config.videoBitrate}k`,
        `-maxrate ${_config.videoBitrate}k`,
        `-bufsize ${_config.videoBitrate * 2}k`,
        '-pix_fmt yuv420p',
        `-s ${_config.canvasWidth}x${_config.canvasHeight}`,
        `-r ${_config.fps}`,
        `-g ${_config.fps * 2}`,
        '-c:a aac',
        `-b:a ${_config.audioBitrate}k`,
        '-ar 44100',
        '-f flv'
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg Process Started:', commandLine);
        if (item.durationMs && item.durationMs > 0) {
          playlistTimeout = setTimeout(() => {
            console.log(`Tempo do item atual expirou (${item.durationMs}ms). Transicionando para o próximo...`);
            streamManager.transitionToNext();
          }, item.durationMs);
        } else if (!item.isLoop) {
          console.log(`Modo auto (até acabar a mídia) detectado. Aguardando sinal de ffmpeg end...`);
        }
      })
      .on('error', (err, stdout, stderr) => {
        if (err.message && err.message.includes('SIGKILL')) {
           console.log('FFmpeg finalizado via SIGKILL. Ignorando erro padrão...');
           return;
        }
        console.error('FFmpeg Error:', err.message);
        console.error('FFmpeg Stderr:', stderr);
        isStreaming = false;
        activeCommand = null;
        if (playlistTimeout) clearTimeout(playlistTimeout);
        _onError(err);
      })
      .on('end', () => {
        console.log('FFmpeg Process Ended naturalmente.');
        if (isStreaming) {
           streamManager.transitionToNext();
        }
      })
      .output(targetUrl);

    activeCommand.run();
  },

  transitionToNext: () => {
    if (activeCommand) {
       activeCommand.kill('SIGKILL');
       activeCommand = null;
    }
    if (playlistTimeout) {
       clearTimeout(playlistTimeout);
       playlistTimeout = null;
    }

    currentPlaylistIndex++;
    
    // Check if we reached the end of the current preset's playlist
    if (currentPlaylistIndex >= currentPlaylist.length) {
       const activePreset = _presets.find(p => p.id === _activePresetId);
       const action = activePreset ? activePreset.actionOnEnd : 'stop';
       
       if (action === 'loop') {
          console.log('Fim da playlist atingido. Fazendo Loop no preset atual...');
          currentPlaylistIndex = 0;
       } else if (action === 'next') {
          const currentPresetIndex = _presets.findIndex(p => p.id === _activePresetId);
          if (currentPresetIndex !== -1 && currentPresetIndex < _presets.length - 1) {
             const nextPreset = _presets[currentPresetIndex + 1];
             console.log(`Fim da playlist atingido. Puxando próximo preset: ${nextPreset.name}`);
             _activePresetId = nextPreset.id;
             currentPlaylist = nextPreset.items;
             currentPlaylistIndex = 0;
          } else {
             console.log('Fim de todos os presets atingido. Parando transmissão...');
             isStreaming = false;
             _onEnd();
             return;
          }
       } else {
          console.log('Fim da playlist atingido. Parando transmissão conforme configurado...');
          isStreaming = false;
          _onEnd();
          return;
       }
    }

    streamManager.playNextItem();
  },

  stopStream: () => {
    isStreaming = false;
    currentPlaylistIndex = 0;
    currentPlaylist = [];
    
    if (playlistTimeout) {
      clearTimeout(playlistTimeout);
      playlistTimeout = null;
    }

    if (activeCommand) {
      activeCommand.kill('SIGKILL');
      activeCommand = null;
      return true;
    }
    return false;
  },

  getStatus: () => {
    return {
      isStreaming,
      currentIndex: currentPlaylistIndex,
      totalItems: currentPlaylist.length
    };
  },

  updateStream: (newOverlays: OverlayItem[]) => {
    if (!isStreaming) return;
    
    // Preserve mediaUrl for media items that didn't upload a new file
    const updatedOverlays = newOverlays.map(newO => {
      if (newO.type === 'media' && !newO.mediaUrl) {
        const oldO = _overlayItems.find(o => o.id === newO.id);
        if (oldO && oldO.mediaUrl) {
          return { ...newO, mediaUrl: oldO.mediaUrl };
        }
      }
      return newO;
    });

    _overlayItems = updatedOverlays;

    if (activeCommand) {
      // Kill the current ffmpeg process silently
      activeCommand.kill('SIGKILL');
      activeCommand = null;
    }

    if (playlistTimeout) {
      clearTimeout(playlistTimeout);
      playlistTimeout = null;
    }

    // Instantly restart with new overlays
    console.log('Update Live: Reiniciando processo FFmpeg...');
    streamManager.playNextItem();
  }
};

// Limpeza automática (Mata o FFmpeg zumbi se o servidor for desligado ou o painel crachar)
const cleanupProcess = () => {
  if (activeCommand) {
    console.log('Painel fechado/reiniciado. Matando processo FFmpeg orfão...');
    activeCommand.kill('SIGKILL');
    activeCommand = null;
  }
};

process.on('exit', cleanupProcess);
process.on('SIGINT', cleanupProcess);
process.on('SIGTERM', cleanupProcess);
process.on('uncaughtException', cleanupProcess);
