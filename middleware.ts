import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  // @supabase/ssr writes chunked cookies named `sb-<project-ref>-auth-token(.<n>)?`
  // so we match any cookie that looks like a Supabase auth token.
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
}

// In-memory sliding-window rate limiter. Works for single-instance dev; on
// multi-instance serverless each instance has its own map, so real rate
// limits should move to Redis/Upstash. Good enough to throttle basic abuse.
const rateLimit = new Map<string, number[]>()
const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 60

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(request: NextRequest, pathname: string): NextResponse | null {
  if (!pathname.startsWith('/api/')) return null

  const key = `${getClientIp(request)}:${pathname}`
  const now = Date.now()
  const recent = (rateLimit.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)

  if (recent.length >= RATE_MAX) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  recent.push(now)
  rateLimit.set(key, recent)
  return null
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate-limit all /api/* hits (runs before auth so even unauth requests are throttled)
  const limited = rateLimited(request, pathname)
  if (limited) return limited

  // Allow public routes
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const loggedIn = hasSupabaseSession(request)

  // If no session and trying to access protected route, redirect to login
  if (!loggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes require admin role
  // NOTE: Middleware runs on the edge without a DB connection, so fine-grained
  // role checks (admin vs. teller vs. member_service) are enforced inside the
  // admin/staff pages themselves against sacco_memberships.role.
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
