/* eslint-disable @typescript-eslint/no-explicit-any */
import ffmpeg from 'fluent-ffmpeg';
import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

// Force the path relative to process.cwd() to bypass Next.js/Turbopack string replacement issues
const ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

export interface PlaylistItem {
  url: string;
  durationMs?: number; 
  isLoop?: boolean; 
}

export interface OverlayItem {
  id: string;
  type: 'text' | 'media' | 'clock' | 'marquee' | 'box';
  text?: string;
  mediaUrl?: string;
  x: string | number;
  y: string | number;
  color?: string;
  fontsize?: string | number;
  width?: string | number;
  height?: string | number;
}

let activeCommand: ffmpeg.FfmpegCommand | null = null;
let isStreaming = false;
let currentPlaylist: PlaylistItem[] = [];
let currentPlaylistIndex = 0;
let playlistTimeout: NodeJS.Timeout | null = null;

let _streamUrl = '';
let _streamKey = '';
let _onEnd: () => void = () => {};
let _onError: (err: any) => void = () => {};
let _overlayItems: OverlayItem[] = [];

export const streamManager = {
  startStream: (
    playlist: PlaylistItem[], 
    streamUrl: string, 
    streamKey: string, 
    overlayItems: OverlayItem[],
    onEnd: () => void, 
    onError: (err: any) => void
  ) => {
    if (isStreaming) {
      throw new Error("Já existe uma transmissão em andamento.");
    }
    
    if (!playlist || playlist.length === 0) {
      throw new Error("A playlist está vazia.");
    }

    _streamUrl = streamUrl;
    _streamKey = streamKey;
    _overlayItems = overlayItems || [];
    _onEnd = onEnd;
    _onError = onError;
    
    currentPlaylist = playlist;
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
      console.log('Playlist terminada.');
      isStreaming = false;
      _onEnd();
      return;
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

    // Para o canvas bater exatamente, vamos forçar a scale do video base pra 1920x1080 antes de injetar qualquer coisa.
    // Isso garante que todos os X e Y calculados no Canvas frontend façam sentido.
    if (_overlayItems.length > 0) {
       filters.push({
          filter: 'scale',
          options: '1920:1080',
          inputs: '0:v',
          outputs: 'base_scaled'
       });
       lastVideoMap = 'base_scaled';
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
             text: '%{localtime\\:%H\\\\:%M\\\\:%S}', // FFmpeg local time string
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
           const drawtextOpts: any = {
             text: text,
             fontsize: overlay.fontsize || '48',
             y: overlay.y,
             x: 'w-mod(t*150\\,w+tw)' // Scroll math (150 is speed)
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
           
           // Support dynamic alpha replacement for solid boxes based on global opacity slider
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
        '-b:v 3000k',
        '-maxrate 3000k',
        '-bufsize 6000k',
        '-pix_fmt yuv420p',
        '-s 1920x1080', // Força saída em 1080p
        '-r 30',
        '-g 60',
        '-c:a aac',
        '-b:a 160k',
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
