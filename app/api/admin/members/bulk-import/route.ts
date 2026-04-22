import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'
import { generateMemberNumber } from '@/lib/members/member-number'

const MAX_FILE_BYTES = 5 * 1024 * 1024

interface ImportRow {
  full_name?: string
  phone?: string
  national_id?: string
  email?: string
}

function cellToString(v: any): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'object') {
    v = v.text ?? v.result ?? v.hyperlink ?? v
  }
  const s = String(v).trim()
  return s.length > 0 ? s : undefined
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Workbook has no sheets')

  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim()
  })

  const rows: ImportRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    if (!row.hasValues) continue
    const obj: Record<string, any> = {}
    headers.forEach((h, i) => {
      if (!h) return
      obj[h] = cellToString(row.getCell(i + 1).value)
    })
    rows.push(obj)
  }
  return rows
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File must be under ${MAX_FILE_BYTES / 1024 / 1024}MB` },
      { status: 413 }
    )
  }

  let members: ImportRow[]
  try {
    const buffer = await file.arrayBuffer()
    members = await parseWorkbook(buffer)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not parse workbook' },
      { status: 400 }
    )
  }

  if (members.length === 0) {
    return NextResponse.json({ error: 'Workbook is empty' }, { status: 400 })
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

  const results = { success: 0, failed: 0, errors: [] as any[] }

  for (let i = 0; i < members.length; i++) {
    const member = members[i] || {}
    try {
      if (!member.full_name || !member.phone || !member.national_id) {
        throw new Error('full_name, phone, national_id are required')
      }

      let userId: string | null = null

      // Two separate lookups instead of .or(...) interpolation: safer
      // against Excel cells containing commas, parens, or quotes that
      // would break the PostgREST filter parser.
      const byPhone = await supabase
        .from('users')
        .select('id')
        .eq('phone', member.phone)
        .maybeSingle()
      if (byPhone.data) {
        userId = byPhone.data.id
      } else {
        const byId = await supabase
          .from('users')
          .select('id')
          .eq('national_id', member.national_id)
          .maybeSingle()
        if (byId.data) {
          userId = byId.data.id
        }
      }

      if (!userId) {
        const { data: newUser, error: userErr } = await supabase
          .from('users')
          .insert({
            full_name: member.full_name,
            phone: member.phone,
            national_id: member.national_id,
            email: member.email ?? null,
          })
          .select()
          .single()
        if (userErr || !newUser) {
          throw new Error(userErr?.message || 'Failed to create user')
        }
        userId = newUser.id
      }

      const memberNumber = await generateMemberNumber(supabase, sacco.id)

      const { error: membershipErr } = await supabase
        .from('sacco_memberships')
        .insert({
          sacco_id: sacco.id,
          user_id: userId,
          member_number: memberNumber,
          is_verified: true,
          joined_at: new Date().toISOString(),
        })

      if (membershipErr) {
        throw new Error(membershipErr.message)
      }

      results.success++
    } catch (error: any) {
      results.failed++
      results.errors.push({
        row: i + 2,
        error: error?.message || 'Unknown error',
        data: member,
      })
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
