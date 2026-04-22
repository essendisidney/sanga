import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/terms',
  '/offline',
  '/test-sms',
]

// Roles allowed to reach /admin/* and /staff/* routes.
const STAFF_ROLES = ['admin', 'manager', 'teller', 'loan_officer', 'member_service']
const ADMIN_ROLES = ['admin', 'manager']

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/api/sms')) return true
  if (pathname.startsWith('/api/mpesa')) return true
  return false
}

function isAdminPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function isStaffPath(pathname: string) {
  return pathname === '/staff' || pathname.startsWith('/staff/')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next({ request })

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

  // 1. Not logged in -> /login (except public paths)
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // 2. Already logged in and hitting /login -> /dashboard
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // 3. Role gate for /admin/* and /staff/*
  if (user && (isAdminPath(pathname) || isStaffPath(pathname))) {
    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const role = membership?.role

    const allowed = isAdminPath(pathname)
      ? ADMIN_ROLES.includes(role || '')
      : STAFF_ROLES.includes(role || '')

    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
