import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { generateStatementPDF, type StatementMember, type StatementTransaction } from '@/lib/pdf/generate'
import { renderToBuffer } from '@react-pdf/renderer'
import { logAudit, AuditAction } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

const MAX_RANGE_DAYS = 366
const MS_PER_DAY = 24 * 60 * 60 * 1000

// PDF generation is CPU + memory heavy (WebAssembly font layout). The
// middleware's 60/min/IP is too loose for this specifically, so we apply
// a tighter per-user cap: 10 PDFs per hour.
const PDF_RATE_LIMIT = 10
const PDF_RATE_WINDOW_SECONDS = 60 * 60

const schema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  member_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await rateLimit({
    key: `pdf:statements:${user.id}`,
    limit: PDF_RATE_LIMIT,
    windowSeconds: PDF_RATE_WINDOW_SECONDS,
  })
  if (!limit.success) {
    return NextResponse.json(
      {
        error: `Too many statement downloads. Try again in ${Math.ceil(
          limit.resetSeconds / 60,
        )} minute(s).`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(limit.resetSeconds),
          'X-RateLimit-Limit': String(PDF_RATE_LIMIT),
          'X-RateLimit-Remaining': String(limit.remaining),
        },
      },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 }
    )
  }
  const { startDate, endDate, member_id } = parsed.data

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'startDate and endDate must be valid ISO dates' },
      { status: 400 }
    )
  }
  if (end < start) {
    return NextResponse.json(
      { error: 'endDate must be after startDate' },
      { status: 400 }
    )
  }
  const rangeDays = (end.getTime() - start.getTime()) / MS_PER_DAY
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `Date range exceeds ${MAX_RANGE_DAYS}-day maximum` },
      { status: 400 }
    )
  }

  // Scope: default to self. If a caller asks for someone else's statement,
  // they must be an admin/manager in the SACCO.
  const targetUserId = member_id && member_id !== user.id ? member_id : user.id
  let isAdminView = false

  if (targetUserId !== user.id) {
    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('role')
      .eq('user_id', user.id)
      .single()
    if (!membership || !['admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden: admins only can generate statements for other members' },
        { status: 403 }
      )
    }
    isAdminView = true
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('id, full_name, phone')
    .eq('id', targetUserId)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const { data: membership } = await supabase
    .from('sacco_memberships')
    .select('id, member_number')
    .eq('user_id', targetUserId)
    .single()

  const { data: account } = membership
    ? await supabase
        .from('member_accounts')
        .select('balance')
        .eq('sacco_membership_id', membership.id)
        .eq('account_type', 'savings')
        .single()
    : { data: null }

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, type, amount, balance_before, balance_after, description, created_at')
    .eq('user_id', targetUserId)
    .gte('created_at', start.toISOString())
    .lte('created_at', `${endDate}T23:59:59.999Z`)
    .order('created_at', { ascending: true })
    .limit(5000)

  const member: StatementMember = {
    full_name: userRow.full_name ?? null,
    phone: userRow.phone ?? null,
    member_number: membership?.member_number ?? null,
    balance: (account as any)?.balance ?? 0,
  }

  const pdfBuffer = await renderToBuffer(
    generateStatementPDF(member, (transactions || []) as StatementTransaction[], startDate, endDate)
  )

  // Admin viewing someone else's PII + financial history: always audit.
  if (isAdminView) {
    logAudit(
      user.id,
      AuditAction.SETTINGS_CHANGE,
      {
        operation: 'statement_download',
        target_user_id: targetUserId,
        startDate,
        endDate,
        row_count: transactions?.length ?? 0,
      },
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined,
    ).catch((e) => console.error('audit log failed:', e))
  }

  const filename = `statement_${member.member_number || targetUserId}_${startDate}_${endDate}.pdf`

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
