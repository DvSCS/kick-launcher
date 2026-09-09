import { NextRequest, NextResponse } from 'next/server';
import { streamManager } from '@/lib/streamManager';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    if (!streamManager.getStatus().isStreaming) {
      return NextResponse.json({ error: 'Nenhuma transmissão em andamento para atualizar.' }, { status: 400 });
    }
    
    // Process Overlay Items
    let overlayItems: any[] = [];
    const overlayItemsStr = formData.get('overlayItems') as string;
    
    if (overlayItemsStr) {
      try {
        overlayItems = JSON.parse(overlayItemsStr);
        
        // Iterate through items to find and save attached media files
        const tmpDir = path.join(process.cwd(), 'tmp');
        await fs.mkdir(tmpDir, { recursive: true });

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
              } else {
                 // Try to preserve existing mediaUrl if it exists in streamManager state
                 // We will handle this gracefully in streamManager.ts
              }
           }
        }

      } catch (e) {
        console.warn('Failed to parse overlayItems in update', e);
      }
    }

    // Update stream
    streamManager.updateStream(overlayItems);

    return NextResponse.json({ success: true, message: 'Transmissão atualizada ao vivo' });
  } catch (error: any) {
    console.error('Erro ao processar /api/stream/update:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
