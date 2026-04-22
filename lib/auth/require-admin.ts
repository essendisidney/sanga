import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

type AdminOk = {
  error: null
  supabase: SupabaseClient
  user: User
  role: string
}

type AdminErr = {
  error: NextResponse
  supabase?: undefined
  user?: undefined
  role?: undefined
}

/**
 * Guard for /api/admin/* routes.
 *
 * Returns either an `error` response to short-circuit the handler, or a
 * `supabase`/`user`/`role` tuple that the handler can use safely, knowing the
 * caller is an authenticated admin or manager.
 *
 * Use as:
 *   const gate = await requireAdmin()
 *   if (gate.error) return gate.error
 *   const { supabase, user, role } = gate
 */
export async function requireAdmin(): Promise<AdminOk | AdminErr> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: membership } = await supabase
    .from('sacco_memberships')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = (membership?.role as string | undefined) || ''

  if (!['admin', 'manager'].includes(role)) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { error: null, supabase, user, role }
}
