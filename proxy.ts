import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * For now, this proxy allows all routes — Sanga uses client-side auth via
 * localStorage ('sanga_user'), so the server has no visibility into whether
 * a user is signed in. Each protected page (e.g. /dashboard) checks
 * localStorage in its own effect and redirects to /login if missing.
 *
 * When we move to cookie-based auth, gate here by checking the request's
 * cookies against publicRoutes below:
 *   const publicRoutes = ['/login', '/', '/test-sms', '/api/sms']
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
