import { NextResponse } from 'next/server';

// In-memory store (replace with Redis/DB for production)
const peerStore = new Map<string, {
  peerId: string,
  createdAt: number
}>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of peerStore.entries()) {
    if (now - value.createdAt > 1000 * 60 * 30) { // 30 minutes expiry
      peerStore.delete(key);
    }
  }
}, 1000 * 60 * 5);

export async function POST(req: Request) {
  const { peerId } = await req.json();
  const shareId = Math.random().toString(36).substring(2, 15);
  
  peerStore.set(shareId, {
    peerId,
    createdAt: Date.now()
  });

  return NextResponse.json({ shareId });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shareId = url.searchParams.get('id');

  if (!shareId) {
    return NextResponse.json({ error: 'Share ID not provided' }, { status: 400 });
  }

  const share = peerStore.get(shareId);
  if (!share) {
    return NextResponse.json({ error: 'Share not found' }, { status: 404 });
  }

  return NextResponse.json({ peerId: share.peerId });
}
