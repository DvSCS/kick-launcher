import { NextRequest, NextResponse } from 'next/server';
import { streamManager } from '@/lib/streamManager';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const streamUrl = formData.get('streamUrl') as string;
    const streamKey = formData.get('streamKey') as string;
    const activePresetId = formData.get('activePresetId') as string;
    const presetsStr = formData.get('presets') as string;

    if (!streamUrl || !streamKey || !presetsStr || !activePresetId) {
      return NextResponse.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });
    }

    if (streamManager.getStatus().isStreaming) {
      return NextResponse.json({ error: 'Já existe uma transmissão em andamento.' }, { status: 400 });
    }
    
    // Process Overlay Items
    let overlayItems: any[] = [];
    const overlayItemsStr = formData.get('overlayItems') as string;
    
    const tmpDir = path.join(process.cwd(), 'tmp');
    await fs.mkdir(tmpDir, { recursive: true });

    if (overlayItemsStr) {
      try {
        overlayItems = JSON.parse(overlayItemsStr);
        
        for (let i = 0; i < overlayItems.length; i++) {
           const item = overlayItems[i];
           if (item.type === 'media') {
              const file = formData.get(`media_${item.id}`) as File;
              if (file) {
                 const arrayBuffer = await file.arrayBuffer();
                 const buffer = Buffer.from(arrayBuffer);
                 const ext = path.extname(file.name) || '.mp4';
                 const mediaPath = path.join(tmpDir, `overlay_${item.id}${ext}`);
                 
                 await fs.writeFile(mediaPath, buffer);
                 item.mediaUrl = mediaPath;
              }
           }
        }
      } catch (e) {
        console.warn('Failed to parse overlayItems', e);
      }
    }

    let presets: any[] = [];
    try {
      presets = JSON.parse(presetsStr);
    } catch (e) {
      return NextResponse.json({ error: 'Formato de presets inválido.' }, { status: 400 });
    }

    let globalFilters = { brightness: 0, contrast: 1, saturation: 1 };
    const globalFiltersStr = formData.get('globalFilters') as string;
    if (globalFiltersStr) {
      try {
        globalFilters = JSON.parse(globalFiltersStr);
      } catch (e) {}
    }

    let config = {
       canvasWidth: 1920,
       canvasHeight: 1080,
       fps: 30,
       videoBitrate: 3000,
       audioBitrate: 160
    };
    const configStr = formData.get('config') as string;
    if (configStr) {
       try {
          config = JSON.parse(configStr);
       } catch (e) {}
    }

    // Process Preset Items (Iterate to find Local Files and save them)
    for (let p of presets) {
      for (let item of p.items) {
        if (item.type === 'file') {
          const file = formData.get(`preset_file_${p.id}_${item.id}`) as File;
          if (file) {
             const arrayBuffer = await file.arrayBuffer();
             const buffer = Buffer.from(arrayBuffer);
             const ext = path.extname(file.name) || '.mp4';
             const mediaPath = path.join(tmpDir, `preset_${p.id}_${item.id}${ext}`);
             
             await fs.writeFile(mediaPath, buffer);
             item.url = mediaPath; // Update the URL to point to local file
          }
        }
      }
    }

    const activePreset = presets.find(p => p.id === activePresetId);
    if (!activePreset || activePreset.items.length === 0) {
      return NextResponse.json({ error: 'Playlist ativa está vazia.' }, { status: 400 });
    }

    // Start stream
    streamManager.startStream(
      presets,
      activePresetId,
      streamUrl,
      streamKey,
      overlayItems,
      globalFilters,
      config,
      () => {
        console.log('Stream encerrou naturalmente');
      },
      (err: any) => {
        console.error('Erro na stream:', err);
      }
    );

    return NextResponse.json({ success: true, message: 'Transmissão iniciada com sucesso' });
  } catch (error: any) {
    console.error('Erro ao processar /api/stream/start:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
