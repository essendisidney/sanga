import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const { membershipId } = await request.json()

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

  return NextResponse.json(data)
}
