import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const { membershipId } = await request.json()

  if (!membershipId || typeof membershipId !== 'string') {
    return NextResponse.json({ error: 'membershipId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sacco_memberships')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString()
    })
    .eq('id', membershipId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logAudit(
    actingAdmin.id,
    AuditAction.MEMBER_UPDATE,
    {
      membership_id: membershipId,
      change: 'verified',
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json(data)
}
