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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
