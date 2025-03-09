import { Redis } from 'ioredis'
import { NextResponse } from 'next/server'

if (!process.env.REDIS_URL) {
  throw new Error('Redis URL is not set')
}

const redis = new Redis(process.env.REDIS_URL)

export async function POST(req: Request) {
  const { peerId } = await req.json()
  const shareId = Math.random().toString(36).substring(2, 15)
  
  // Store with 30 minute expiry
  await redis.set(shareId, JSON.stringify({
    peerId,
    createdAt: Date.now()
  }), 'EX', 1800) // 30 minutes in seconds

  return NextResponse.json({ shareId })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const shareId = url.searchParams.get('id')

  if (!shareId) {
    return NextResponse.json({ error: 'Share ID not provided' }, { status: 400 })
  }

  const share = await redis.get(shareId)
  if (!share) {
    return NextResponse.json({ error: 'Share not found' }, { status: 404 })
  }

  return NextResponse.json({ peerId: JSON.parse(share).peerId })
}
