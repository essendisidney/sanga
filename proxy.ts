import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/terms',
  '/offline',
  '/test-sms',
]

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/api/sms')) return true
  if (pathname.startsWith('/api/mpesa')) return true
  return false
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
