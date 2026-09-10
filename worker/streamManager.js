const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Path fix for ffmpeg-static
const ffmpegPath = path.join(__dirname, 'node_modules', 'ffmpeg-static', os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

let activeCommand = null;
let isStreaming = false;
let currentPlaylist = [];
let currentPlaylistIndex = 0;
let playlistTimeout = null;

let _streamUrl = '';
let _streamKey = '';
let _onEnd = () => {};
let _onError = () => {};
let _overlayItems = [];

const streamManager = {
  startStream: (playlist, streamUrl, streamKey, overlayItems, onEnd, onError) => {
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

    const filters = [];
    let lastVideoMap = '0:v';

    filters.push({
      filter: 'scale',
      options: '1920:1080',
      inputs: lastVideoMap,
      outputs: 'base_video'
    });
    lastVideoMap = 'base_video';

    // Build overlay filters
    _overlayItems.forEach((overlayItem, index) => {
      const outputName = `v_out_${index}`;
      
      if (overlayItem.type === 'text' || overlayItem.type === 'clock' || overlayItem.type === 'marquee') {
        const textToDraw = overlayItem.type === 'clock' 
          ? `%{localtime:%H\\:%M\\:%S}` 
          : (overlayItem.text || '').replace(/:/g, '\\:');
        
        let colorStr = overlayItem.color || 'white';
        if (colorStr.startsWith('#')) {
          colorStr = `0x${colorStr.substring(1)}@1.0`; 
        }
        
        const fontSizeStr = overlayItem.fontsize || '48';
        const fontFile = os.platform() === 'win32' ? "C\\\\:/Windows/Fonts/Arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

        let textFilterParams = `text='${textToDraw}':x=${overlayItem.x}:y=${overlayItem.y}:fontcolor=${colorStr}:fontsize=${fontSizeStr}:fontfile='${fontFile}'`;

        if (overlayItem.type === 'marquee') {
            textFilterParams += `:x=W-mod(t*200\\,W+tw)`; 
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
        '-map 0:a?',
        '-c:v libx264',
        '-preset veryfast',
        '-profile:v main',
        '-b:v 3000k',
        '-maxrate 3000k',
        '-bufsize 6000k',
        '-pix_fmt yuv420p',
        '-s 1920x1080',
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
    console.log('Painel fechado/reiniciado. Matando processo FFmpeg orfão...');
    activeCommand.kill('SIGKILL');
    activeCommand = null;
  }
};

process.on('exit', cleanupProcess);
process.on('SIGINT', cleanupProcess);
process.on('SIGTERM', cleanupProcess);
process.on('uncaughtException', cleanupProcess);

module.exports = streamManager;
