const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Path fix for ffmpeg-static
const ffmpegPath = path.join(__dirname, 'node_modules', 'ffmpeg-static', os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

let activeCommand = null;
let relayCommand = null;
let isStreaming = false;
let currentPlaylist = [];
let currentPlaylistIndex = 0;
let _presets = [];
let _activePresetId = '';
let playlistTimeout = null;

let _streamUrl = '';
let _streamKey = '';
let _onEnd = () => {};
let _onError = () => {};
let _overlayItems = [];
let _globalFilters = { brightness: 0, contrast: 1, saturation: 1 };
let _config = { canvasWidth: 1920, canvasHeight: 1080, fps: 30, videoBitrate: 3000, audioBitrate: 160 };

const streamManager = {
  startStream: (presets, activePresetId, streamUrl, streamKey, overlayItems, globalFilters, config, onEnd, onError) => {
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

    if (!relayCommand) {
      let cleanStreamUrl = _streamUrl.endsWith('/') ? _streamUrl.slice(0, -1) : _streamUrl;
      if (!cleanStreamUrl.endsWith('/app')) {
        cleanStreamUrl += '/app';
      }
      const cleanStreamKey = _streamKey.startsWith('/') ? _streamKey.slice(1) : _streamKey;
      const rtmpTargetUrl = `${cleanStreamUrl}/${cleanStreamKey}`;

      console.log('Iniciando Relay Process para manter a conexão RTMP...');
      relayCommand = ffmpeg('udp://127.0.0.1:10000?fifo_size=5000000&overrun_nonfatal=1')
        .inputOptions([
          '-f mpegts',
          '-use_wallclock_as_timestamps 1'
        ])
        .outputOptions([
          '-c copy',
          '-f flv'
        ])
        .on('start', cmd => console.log('Relay FFmpeg Started:', cmd))
        .on('error', (err) => {
           if (err.message && err.message.includes('SIGKILL')) return;
           console.error('Relay FFmpeg Error:', err.message);
           isStreaming = false;
           relayCommand = null;
           streamManager.stopStream();
           _onError(err);
        })
        .on('end', () => {
           console.log('Relay FFmpeg Ended.');
        })
        .output(rtmpTargetUrl);
        
      relayCommand.run();
    }

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

    // Output to the local UDP Relay
    const targetUrl = 'udp://127.0.0.1:10000?pkt_size=1316';
    
    const isHls = item.url.includes('.m3u8') || item.url.includes('.m3u');
    const isVod = item.url.includes('/movie/') || item.url.includes('/series/') || item.url.includes('/video/') || item.url.includes('/vod/') || item.url.endsWith('.mp4') || item.url.endsWith('.mkv');
    
    // Para lives puras (.m3u8 que não são VOD), NÃO usamos -re, pois o FFmpeg precisa puxar na velocidade que a fonte gera.
    // Usar -re em uma live HLS verdadeira causa stuttering por dessincronia.
    // Mas para VODs ou arquivos locais, PRECISAMOS do -re para não processar 1 hora de vídeo em 1 segundo.
    const useRe = isVod || item.isLoop;

    const baseOptions = [
      '-thread_queue_size', '1024',
      '-user_agent', 'Mozilla/5.0',
      '-fflags', '+genpts+discardcorrupt+igndts'
    ];
    
    if (useRe) {
      baseOptions.unshift('-re');
    }

    const inputOptions = isHls 
        ? [
            ...baseOptions,
            '-reconnect', '1', 
            '-reconnect_delay_max', '5',
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '4xx,5xx'
          ]
        : [
            ...baseOptions,
            '-reconnect', '1', 
            '-reconnect_streamed', '1', 
            '-reconnect_delay_max', '5',
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '4xx,5xx'
          ];

    activeCommand = ffmpeg(item.url)
      .inputOptions(inputOptions);

    const filters = [];
    let lastVideoMap = '0:v';

    if (_config.isFreeCameraEnabled && _config.baseMediaTransform) {
      const transform = _config.baseMediaTransform;
      // Scale
      filters.push({
        filter: 'scale',
        options: `${transform.w}:${transform.h}`,
        inputs: '0:v',
        outputs: 'base_scaled_step1'
      });
      let currentOut = 'base_scaled_step1';

      // Rotate
      if (transform.rotation !== 0) {
        filters.push({
          filter: 'rotate',
          options: `${transform.rotation}*PI/180:c=none`,
          inputs: currentOut,
          outputs: 'base_rotated'
        });
        currentOut = 'base_rotated';
      }

      // Create black background
      filters.push({
        filter: 'color',
        options: `c=black:s=${_config.canvasWidth}x${_config.canvasHeight}`,
        outputs: 'bg_canvas'
      });

      // Overlay the video on the black background
      filters.push({
        filter: 'overlay',
        options: `x=${transform.x}:y=${transform.y}`,
        inputs: ['bg_canvas', currentOut],
        outputs: 'base_scaled'
      });
      lastVideoMap = 'base_scaled';

    } else {
      filters.push({
        filter: 'scale',
        options: `${_config.canvasWidth}:${_config.canvasHeight}`,
        inputs: lastVideoMap,
        outputs: 'base_scaled'
      });
      lastVideoMap = 'base_scaled';
    }
    
    // Apply global EQ filters
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

    // Build overlay filters
    _overlayItems.forEach((overlayItem, index) => {
      const outputName = `v_out_${index}`;
      
      if (overlayItem.type === 'text' || overlayItem.type === 'clock' || overlayItem.type === 'marquee') {
        const textToDraw = overlayItem.type === 'clock' 
          ? `%H\\\\:%M\\\\:%S` 
          : (overlayItem.text || '').replace(/:/g, '\\:');
        
        let colorStr = overlayItem.color || 'white';
        if (colorStr.startsWith('#')) {
          colorStr = `0x${colorStr.substring(1)}@1.0`; 
        }
        
        const fontSizeStr = overlayItem.fontsize || '48';
        const fontName = (overlayItem.font || 'arial').toLowerCase();
        let fontFile = os.platform() === 'win32' 
          ? `C\\\\:/Windows/Fonts/${fontName}.ttf` 
          : `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`;

        let textFilterParams = `text='${textToDraw}':x=${overlayItem.x}:y=${overlayItem.y}:fontcolor=${colorStr}:fontsize=${fontSizeStr}:fontfile='${fontFile}'`;

        if (overlayItem.type === 'clock') {
            textFilterParams += `:expansion=strftime`;
        }

        if (overlayItem.type === 'marquee') {
            const speed = overlayItem.marqueeSpeed || 50;
            // Remove previous x to avoid duplicate param
            textFilterParams = `text='${textToDraw}':y=${overlayItem.y}:fontcolor=${colorStr}:fontsize=${fontSizeStr}:fontfile='${fontFile}':x=W-mod(t*${speed}\\,W+tw)`; 
        }
        
        filters.push({
          filter: 'drawtext',
          options: textFilterParams,
          inputs: lastVideoMap,
          outputs: outputName
        });
        lastVideoMap = outputName;

      } else if (overlayItem.type === 'box') {
        let colorStr = overlayItem.color || 'black';
        if (colorStr.startsWith('#')) {
          colorStr = colorStr.replace('#', '0x') + '@0.8';
        }
        filters.push({
          filter: 'drawbox',
          options: `x=${overlayItem.x}:y=${overlayItem.y}:w=${overlayItem.width || 100}:h=${overlayItem.height || 100}:color=${colorStr}:t=fill`,
          inputs: lastVideoMap,
          outputs: outputName
        });
        lastVideoMap = outputName;
      } else if (overlayItem.type === 'blur') {
        const blurAmount = overlayItem.blurAmount || 10;
        const croppedName = `cropped_blur_${index}`;
        const blurredName = `blurred_${index}`;
        
        filters.push({
           filter: 'crop',
           options: `${overlayItem.width || 100}:${overlayItem.height || 100}:${overlayItem.x}:${overlayItem.y}`,
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
           options: `x=${overlayItem.x}:y=${overlayItem.y}`,
           inputs: [lastVideoMap, blurredName],
           outputs: outputName
        });
        lastVideoMap = outputName;
      }
    });

    const mediaItems = _overlayItems.filter(item => item.type === 'media' && item.mediaUrl);
    
    mediaItems.forEach((mediaItem, index) => {
      activeCommand.input(mediaItem.mediaUrl);
      
      const mediaInputIndex = index + 1; 
      const scaledMediaName = `scaled_media_${index}`;
      const outputName = `v_out_media_${index}`;
      
      filters.push({
        filter: 'scale',
        options: `${mediaItem.width || -1}:${mediaItem.height || -1}`,
        inputs: `${mediaInputIndex}:v`,
        outputs: scaledMediaName
      });

      filters.push({
        filter: 'overlay',
        options: `x=${mediaItem.x}:y=${mediaItem.y}`,
        inputs: [lastVideoMap, scaledMediaName],
        outputs: outputName
      });
      lastVideoMap = outputName;
    });

    if (filters.length > 0) {
      activeCommand.complexFilter(filters, lastVideoMap);
    }

    activeCommand
      .outputOptions([
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
        '-f mpegts'
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

    let killed = false;
    if (activeCommand) {
      activeCommand.kill('SIGKILL');
      activeCommand = null;
      killed = true;
    }
    if (relayCommand) {
      relayCommand.kill('SIGKILL');
      relayCommand = null;
      killed = true;
    }
    return killed;
  },

  getStatus: () => {
    return {
      isStreaming,
      currentIndex: currentPlaylistIndex,
      totalItems: currentPlaylist.length
    };
  },

  updateStream: (newOverlays) => {
    if (!isStreaming) return;
    
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
      activeCommand.kill('SIGKILL');
      activeCommand = null;
    }

    if (playlistTimeout) {
      clearTimeout(playlistTimeout);
      playlistTimeout = null;
    }

    console.log('Update Live: Reiniciando processo FFmpeg...');
    streamManager.playNextItem();
  }
};

const cleanupProcess = () => {
  if (activeCommand) {
    console.log('Matando processo FFmpeg Content...');
    activeCommand.kill('SIGKILL');
    activeCommand = null;
  }
  if (relayCommand) {
    console.log('Matando processo FFmpeg Relay...');
    relayCommand.kill('SIGKILL');
    relayCommand = null;
  }
};

process.on('exit', cleanupProcess);
process.on('SIGINT', cleanupProcess);
process.on('SIGTERM', cleanupProcess);
process.on('uncaughtException', cleanupProcess);

module.exports = streamManager;
