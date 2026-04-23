import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from '@/lib/redis'

// Per-key rate limiter with an in-memory fallback for local dev.
//
// Usage in a route:
//   const { success, remaining } = await rateLimit({
//     key: `pdf:${user.id}`,
//     limit: 10,
//     windowSeconds: 60 * 60,
//   })
//   if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
//
// Upstash is shared across serverless instances; the in-memory Map is
// per-instance only and is only acceptable as a dev fallback.

type LimiterEntry = {
  limiter: Ratelimit
  limit: number
  windowSeconds: number
}

const limiterCache = new Map<string, LimiterEntry>()
const memoryState = new Map<string, number[]>()

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  const cacheKey = `${limit}:${windowSeconds}`
  const hit = limiterCache.get(cacheKey)
  if (hit) return hit.limiter
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
    prefix: 'sanga:rl',
  })
  limiterCache.set(cacheKey, { limiter, limit, windowSeconds })
  return limiter
}

export interface RateLimitOptions {
  key: string
  limit: number
  windowSeconds: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetSeconds: number
}

export async function rateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const upstash = getLimiter(limit, windowSeconds)
  if (upstash) {
    const res = await upstash.limit(key)
    return {
      success: res.success,
      remaining: res.remaining,
      resetSeconds: Math.max(0, Math.ceil((res.reset - Date.now()) / 1000)),
    }
  }

  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const recent = (memoryState.get(key) || []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now
    return {
      success: false,
      remaining: 0,
      resetSeconds: Math.max(0, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }
  recent.push(now)
  memoryState.set(key, recent)
  return { success: true, remaining: limit - recent.length, resetSeconds: windowSeconds }
}
