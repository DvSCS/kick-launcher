import { NextRequest, NextResponse } from 'next/server';
import { streamManager } from '@/lib/streamManager';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const streamUrl = formData.get('streamUrl') as string;
    const streamKey = formData.get('streamKey') as string;
    const mode = formData.get('mode') as string;

    if (!streamUrl || !streamKey || !mode) {
      return NextResponse.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });
    }

    if (streamManager.getStatus().isStreaming) {
      return NextResponse.json({ error: 'Já existe uma transmissão em andamento.' }, { status: 400 });
    }

    let playlist: { url: string, durationMs?: number, isLoop?: boolean }[] = [];
    
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
              }
           }
        }

      } catch (e) {
        console.warn('Failed to parse overlayItems', e);
      }
    }

    if (mode === 'upload') {
      const file = formData.get('video') as File;
      if (!file) return NextResponse.json({ error: 'Arquivo de vídeo não enviado.' }, { status: 400 });

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const tmpDir = path.join(process.cwd(), 'tmp');
      const filePath = path.join(tmpDir, 'video.mp4');

      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
      
      playlist.push({ url: filePath, isLoop: true });
    } else if (mode === 'reback') {
      const playlistStr = formData.get('playlist') as string;
      if (!playlistStr) {
         return NextResponse.json({ error: 'URL de retransmissão não informada.' }, { status: 400 });
      } else {
         try {
            playlist = JSON.parse(playlistStr);
         } catch (e) {
            return NextResponse.json({ error: 'Formato de playlist inválido.' }, { status: 400 });
         }
      }
      
      if (playlist.length === 0) {
        return NextResponse.json({ error: 'Playlist vazia.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Modo inválido.' }, { status: 400 });
    }

    // Start stream
    streamManager.startStream(
      playlist,
      streamUrl,
      streamKey,
      overlayItems,
      () => {
        console.log('Stream encerrou naturalmente');
      },
      (err) => {
        console.error('Erro na stream:', err);
      }
    );

    return NextResponse.json({ success: true, message: 'Transmissão iniciada com sucesso' });
  } catch (error: any) {
    console.error('Erro ao processar /api/stream/start:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
