import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'
import { generateMemberNumber } from '@/lib/members/member-number'
import { sendEmail, emailTemplates } from '@/lib/email/send'

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
  const { supabase, user: actingAdmin } = auth

  const body = await request.json()

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

  const memberNumber = await generateMemberNumber(supabase, sacco.id)

  const { data, error } = await supabase
    .from('sacco_memberships')
    .insert({
      sacco_id: sacco.id,
      user_id: userId,
      member_number: memberNumber,
      role: body.role || 'member',
      is_verified: body.is_verified || false,
      joined_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logAudit(
    actingAdmin.id,
    AuditAction.MEMBER_CREATE,
    {
      membership_id: data?.id,
      target_user_id: userId,
      sacco_id: sacco.id,
      member_number: memberNumber,
      role: body.role || 'member',
      is_verified: body.is_verified || false,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  // Fire-and-forget welcome email. Silently no-ops if RESEND_API_KEY is
  // missing or the sanga.africa domain isn't verified on Resend yet.
  if (body.email) {
    const tpl = emailTemplates.welcome(body.full_name || 'Member', memberNumber)
    sendEmail({
      to: body.email,
      subject: tpl.subject,
      html: tpl.html,
      auditUserId: actingAdmin.id,
    }).catch((e) => console.error('welcome email failed:', e))
  }

  return NextResponse.json(data)
}
