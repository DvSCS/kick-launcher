import { NextResponse } from 'next/server';
import { streamManager } from '@/lib/streamManager';

export async function POST() {
  const stopped = streamManager.stopStream();
  if (stopped) {
    return NextResponse.json({ success: true, message: 'Transmissão parada com sucesso' });
  } else {
    return NextResponse.json({ error: 'Nenhuma transmissão em andamento.' }, { status: 400 });
  }
}
