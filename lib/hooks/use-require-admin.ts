'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type RoleState = 'loading' | 'allowed' | 'denied'

/**
 * Client-side gate for /admin/* pages. Calls /api/me/role on mount and
 * redirects away if the caller isn't admin/manager.
 *
 * Note: this is UX only. All admin APIs already enforce role via
 * requireAdmin() on the server. Never rely on this for security.
 */
export function useRequireAdmin(redirectTo: string = '/dashboard'): RoleState {
  const router = useRouter()
  const [state, setState] = useState<RoleState>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/role', { cache: 'no-store' })
        if (res.status === 401) {
          router.replace('/login')
          return
        }
        const body = await res.json()
        if (cancelled) return
        if (['admin', 'manager'].includes(body?.role)) {
          setState('allowed')
        } else {
          toast.error('Admin access required')
          setState('denied')
          router.replace(redirectTo)
        }
      } catch {
        if (!cancelled) {
          setState('denied')
          router.replace(redirectTo)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router, redirectTo])

  return state
}
