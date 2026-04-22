import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lightweight "who am I?" endpoint for client components that need to gate
 * render based on SACCO role. Returns:
 *   { user_id, role: 'admin' | 'manager' | 'member' | 'teller' | 'loan_officer' | null }
 * or 401 if the caller has no session.
 *
 * Clients should treat absence of the `role` field (or !admin/manager) as
 * "not allowed" and redirect. Authoritative checks still happen server-side
 * in every admin API route via requireAdmin(); this is UX, not security.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('sacco_memberships')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(
    {
      user_id: user.id,
      role: membership?.role ?? null,
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
