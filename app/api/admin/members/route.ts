import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET() {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const { data: members } = await supabase
    .from('sacco_memberships')
    .select(`
      id,
      member_number,
      role,
      is_verified,
      joined_at,
      users (
        id,
        full_name,
        phone,
        email,
        national_id,
        status
      )
    `)
    .order('joined_at', { ascending: false })

  return NextResponse.json(members || [])
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const body = await request.json()

  // First create or get user
  let userId = body.user_id

  if (!userId) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone', body.phone)
      .single()

    if (existingUser) {
      userId = existingUser.id
    } else {
      const { data: newUser, error: userErr } = await supabase
        .from('users')
        .insert({
          phone: body.phone,
          full_name: body.full_name,
          national_id: body.national_id,
          email: body.email
        })
        .select()
        .single()
      if (userErr || !newUser) {
        return NextResponse.json(
          { error: userErr?.message || 'Failed to create user' },
          { status: 500 }
        )
      }
      userId = newUser.id
    }
  }

  // Get SACCO ID
  const { data: sacco } = await supabase
    .from('saccos')
    .select('id')
    .limit(1)
    .single()

  if (!sacco) {
    return NextResponse.json(
      { error: 'No SACCO configured' },
      { status: 500 }
    )
  }

  // Create membership
  const { data, error } = await supabase
    .from('sacco_memberships')
    .insert({
      sacco_id: sacco.id,
      user_id: userId,
      role: body.role || 'member',
      is_verified: body.is_verified || false
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
