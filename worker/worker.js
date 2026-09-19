const express = require('express');
const cors = require('cors');
const multer = require('multer');
const localtunnel = require('localtunnel');
const fs = require('fs/promises');
const path = require('path');
const streamManager = require('./streamManager');

const app = express();
const port = 4000;

app.use(cors()); // Allow all origins for the tunnel
app.use(express.json());

const upload = multer({ dest: path.join(__dirname, 'tmp') });

// Helper to convert formData to expected format
app.post('/api/stream/start', upload.any(), async (req, res) => {
  try {
    const body = req.body;
    const streamUrl = body.streamUrl;
    const streamKey = body.streamKey;
    const mode = body.mode;
    
    let presets = [];
    let activePresetId = body.activePresetId || '';

    if (mode === 'upload') {
      const baseVideo = (req.files || []).find(f => f.fieldname === 'video');
      if (baseVideo) {
        const ext = path.extname(baseVideo.originalname) || '.mp4';
        const newPath = path.join(__dirname, 'tmp', `base_video_${Date.now()}${ext}`);
        await fs.rename(baseVideo.path, newPath);
        // Create a fake preset structure for legacy upload mode
        presets = [{
           id: 'legacy-upload',
           name: 'Upload',
           actionOnEnd: 'loop',
           items: [{ url: newPath, isLoop: true, id: 'base-vid' }]
        }];
        activePresetId = 'legacy-upload';
      } else {
        throw new Error("Vídeo base não foi enviado.");
      }
    } else {
      presets = JSON.parse(body.presets || '[]');
      
      // Process preset files
      for (let p of presets) {
        for (let item of p.items) {
          if (item.type === 'file') {
            const file = (req.files || []).find(f => f.fieldname === `preset_file_${p.id}_${item.id}`);
            if (file) {
              const ext = path.extname(file.originalname) || '.mp4';
              const newPath = path.join(__dirname, 'tmp', `preset_${p.id}_${item.id}${ext}`);
              await fs.rename(file.path, newPath);
              item.url = newPath;
            }
          }
        }
      }
    }

    let overlayItems = JSON.parse(body.overlayItems || '[]');

    // Process overlay files
    for (let i = 0; i < overlayItems.length; i++) {
      const item = overlayItems[i];
      if (item.type === 'media') {
        const file = (req.files || []).find(f => f.fieldname === `media_${item.id}`);
        if (file) {
          const ext = path.extname(file.originalname) || '.mp4';
          const newPath = path.join(__dirname, 'tmp', `overlay_${item.id}${ext}`);
          await fs.rename(file.path, newPath);
          item.mediaUrl = newPath;
        }
      }
    }

    let globalFilters = JSON.parse(body.globalFilters || '{}');
    let config = JSON.parse(body.config || '{}');

    streamManager.startStream(presets, activePresetId, streamUrl, streamKey, overlayItems, globalFilters, config,
      () => console.log("Stream acabou"), 
      (err) => console.error("Erro no stream", err)
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stream/update', upload.any(), async (req, res) => {
  try {
    if (!streamManager.getStatus().isStreaming) {
      return res.status(400).json({ error: 'Nenhuma stream ativa.' });
    }

    const body = req.body;
    let overlayItems = JSON.parse(body.overlayItems || '[]');

    for (let i = 0; i < overlayItems.length; i++) {
      const item = overlayItems[i];
      if (item.type === 'media') {
        const file = (req.files || []).find(f => f.fieldname === `media_${item.id}`);
        if (file) {
          const ext = path.extname(file.originalname) || '.mp4';
          const newPath = path.join(__dirname, 'tmp', `overlay_${item.id}${ext}`);
          await fs.rename(file.path, newPath);
          item.mediaUrl = newPath;
        }
      }
    }

    streamManager.updateStream(overlayItems);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stream/stop', (req, res) => {
  const stopped = streamManager.stopStream();
  res.json({ success: true, stopped });
});

app.get('/api/stream/status', (req, res) => {
  res.json(streamManager.getStatus());
});

app.listen(port, async () => {
  console.log(`\n============================================`);
  console.log(`✅ Worker Local iniciado na porta ${port}`);
  console.log(`📡 Gerando Link do Túnel Seguro (Localtunnel)...`);
  
  try {
    const tunnel = await localtunnel({ port: port });
    console.log(`\n🔗 **COPIE ESTE LINK E COLE NO SITE DA VERCEL:**`);
    console.log(`👉 ${tunnel.url}`);
    console.log(`============================================\n`);
    
    tunnel.on('close', () => {
      console.log('Túnel fechado. Reinicie o Worker.');
    });
  } catch (err) {
    console.error("Erro ao gerar túnel:", err);
  }
});
