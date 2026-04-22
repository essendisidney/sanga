import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'
import * as XLSX from 'xlsx'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ error: 'Workbook has no sheets' }, { status: 400 })
  }
  const sheet = workbook.Sheets[sheetName]!
  const members = XLSX.utils.sheet_to_json<any>(sheet)

  // Pre-load SACCO once (was N+1 inside the loop)
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

  const results = { success: 0, failed: 0, errors: [] as any[] }

  for (let i = 0; i < members.length; i++) {
    const member: any = members[i]
    try {
      if (!member.full_name || !member.phone || !member.national_id) {
        throw new Error('full_name, phone, national_id are required')
      }

      let userId: string | null = null

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .or(`phone.eq.${member.phone},national_id.eq.${member.national_id}`)
        .single()

      if (existing) {
        userId = existing.id
      } else {
        const { data: newUser, error: userErr } = await supabase
          .from('users')
          .insert({
            full_name: member.full_name,
            phone: member.phone,
            national_id: member.national_id,
            email: member.email
          })
          .select()
          .single()
        if (userErr || !newUser) {
          throw new Error(userErr?.message || 'Failed to create user')
        }
        userId = newUser.id
      }

      const { error: membershipErr } = await supabase
        .from('sacco_memberships')
        .insert({
          sacco_id: sacco.id,
          user_id: userId,
          member_number: `SGA-${Date.now()}-${i}`,
          is_verified: true,
          joined_at: new Date().toISOString()
        })

      if (membershipErr) {
        throw new Error(membershipErr.message)
      }

      results.success++
    } catch (error: any) {
      results.failed++
      results.errors.push({ row: i + 2, error: error?.message || 'Unknown error', data: member })
    }
  }

  logAudit(
    actingAdmin.id,
    AuditAction.MEMBER_CREATE,
    {
      operation: 'bulk_import',
      filename: file.name,
      rows_total: members.length,
      success: results.success,
      failed: results.failed,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json(results)
}
