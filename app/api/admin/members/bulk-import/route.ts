import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'

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

  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    imported: [] as Array<{ row: number; phone?: string; member_number: string }>,
    errors: [] as Array<{ row: number; error: string; data: ImportRow }>,
    skippedRows: [] as Array<{ row: number; phone?: string; reason: string }>,
  }

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
      } else {
        // User already existed. If they also already have a membership in
        // this sacco, treat this row as a no-op skip so re-uploads of the
        // same file are idempotent rather than noisy failures.
        const existing = await supabase
          .from('sacco_memberships')
          .select('member_number')
          .eq('sacco_id', sacco.id)
          .eq('user_id', userId)
          .maybeSingle()
        if (existing.data) {
          results.skipped++
          results.skippedRows.push({
            row: i + 2,
            phone: member.phone,
            reason: `Already a member (${existing.data.member_number ?? 'no number'})`,
          })
          continue
        }
      }

      // member_number is filled by the trg_set_member_number trigger
      // (see supabase/migrations/20260422_member_number_sequence.sql).
      const { data: newMembership, error: membershipErr } = await supabase
        .from('sacco_memberships')
        .insert({
          sacco_id: sacco.id,
          user_id: userId,
          is_verified: true,
          joined_at: new Date().toISOString(),
        })
        .select('member_number')
        .single()

      if (membershipErr) {
        // Unique-constraint violations (sacco_id, user_id) mean we raced
        // ourselves or a concurrent import; treat as skipped.
        if (/duplicate|unique/i.test(membershipErr.message || '')) {
          results.skipped++
          results.skippedRows.push({
            row: i + 2,
            phone: member.phone,
            reason: 'Already a member (race)',
          })
          continue
        }
        throw new Error(membershipErr.message)
      }

      results.success++
      results.imported.push({
        row: i + 2,
        phone: member.phone,
        member_number: newMembership?.member_number ?? '',
      })
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
      skipped: results.skipped,
      failed: results.failed,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json(results)
}
