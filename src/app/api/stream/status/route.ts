import { NextResponse } from 'next/server';
import { streamManager } from '@/lib/streamManager';

export async function GET() {
  const status = streamManager.getStatus();
  return NextResponse.json(status);
}
