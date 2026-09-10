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
    const playlist = JSON.parse(body.playlist || '[]');
    let overlayItems = JSON.parse(body.overlayItems || '[]');

    // Process files
    for (let i = 0; i < overlayItems.length; i++) {
      const item = overlayItems[i];
      if (item.type === 'media') {
        const file = req.files.find(f => f.fieldname === `media_${item.id}`);
        if (file) {
          const ext = path.extname(file.originalname) || '.mp4';
          const newPath = path.join(__dirname, 'tmp', `overlay_${item.id}${ext}`);
          await fs.rename(file.path, newPath);
          item.mediaUrl = newPath;
        }
      }
    }

    streamManager.startStream(playlist, streamUrl, streamKey, overlayItems, 
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
        const file = req.files.find(f => f.fieldname === `media_${item.id}`);
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
