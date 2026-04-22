import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from '@/lib/redis'

// Public routes that don't require authentication
const publicRoutes = ['/login', '/', '/admin-test', '/terms', '/offline', '/test-sms']

// Public path prefixes (e.g. auth + webhook APIs)
const publicPrefixes = ['/api/sms', '/api/mpesa']

function isPublic(pathname: string) {
  if (publicRoutes.includes(pathname)) return true
  if (publicPrefixes.some((p) => pathname.startsWith(p))) return true
  return false
}

function hasSupabaseSession(request: NextRequest) {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
}

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 60

// Prefer Upstash (shared across serverless instances) when configured.
// Falls back to a per-instance in-memory Map for local dev.
const redis = getRedis()
const upstashLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_MAX, `${RATE_WINDOW_MS / 1000} s`),
      analytics: false,
      prefix: 'sanga:rl',
    })
  : null

const memoryLimit = new Map<string, number[]>()

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

async function rateLimited(
  request: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  if (!pathname.startsWith('/api/')) return null

  const key = `${getClientIp(request)}:${pathname}`

  if (upstashLimiter) {
    const { success } = await upstashLimiter.limit(key)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }
    return null
  }

  // In-memory fallback (single-instance only)
  const now = Date.now()
  const recent = (memoryLimit.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }
  recent.push(now)
  memoryLimit.set(key, recent)
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const limited = await rateLimited(request, pathname)
  if (limited) return limited

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const loggedIn = hasSupabaseSession(request)
  if (!loggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Fine-grained role checks run inside admin/staff pages (edge has no DB).
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
