import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Gate for admin-only API routes.
 *
 * Usage in a route handler:
 *
 *   const auth = await requireAdmin()
 *   if ('response' in auth) return auth.response
 *   const { supabase, user, role } = auth
 *
 * Returns the authed Supabase server client + the user + their SACCO role
 * when the caller is an admin/manager. Otherwise returns a pre-baked
 * 401/403 `response` to return immediately.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const
  }

  const { data: membership } = await supabase
    .from('sacco_memberships')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = membership?.role
  if (!role || !['admin', 'manager'].includes(role)) {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as const
  }

  return { supabase, user, role } as const
}
