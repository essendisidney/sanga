import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'

export async function GET() {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const { data: dividends } = await supabase
    .from('dividends')
    .select('*, member_dividends(*)')
    .order('declared_date', { ascending: false })

  return NextResponse.json(dividends || [])
}

// Declare a new dividend and create per-member dividend rows atomically.
// All inserts happen inside declare_dividend() so a partial run (dividend
// created but some member rows missing) cannot happen.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const body = await request.json()
  const { rate, financial_year } = body

  if (rate == null || !financial_year) {
    return NextResponse.json(
      { error: 'rate and financial_year are required' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc('declare_dividend', {
    p_rate: Number(rate),
    p_financial_year: String(financial_year),
  })

  if (error) {
    const msg = error.message || 'Failed to declare dividend'
    const duplicate = /duplicate|unique/i.test(msg)
    return NextResponse.json(
      {
        error: duplicate
          ? `Dividend already declared for financial year ${financial_year}`
          : msg,
      },
      { status: duplicate ? 409 : 500 },
    )
  }

  const result = (data ?? {}) as {
    dividend_id?: string
    total_dividend_amount?: number
    members_count?: number
  }

  logAudit(
    actingAdmin.id,
    AuditAction.SETTINGS_CHANGE,
    {
      operation: 'declare_dividend',
      dividend_id: result.dividend_id,
      financial_year,
      rate,
      total_dividend_amount: result.total_dividend_amount,
      members_count: result.members_count,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json({
    id: result.dividend_id,
    financial_year,
    dividend_rate: rate,
    total_dividend_amount: result.total_dividend_amount ?? 0,
    members_count: result.members_count ?? 0,
    status: 'declared',
  })
}

// Pay a declared dividend to every member's savings account atomically.
// Delegates to pay_dividend(): a single transaction flips status, credits
// every savings account, inserts a transaction row, and marks each
// member_dividend paid. A mid-run failure rolls back every credit.
export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const body = await request.json()
  const { dividend_id } = body

  if (!dividend_id) {
    return NextResponse.json({ error: 'dividend_id required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('pay_dividend', {
    p_dividend_id: dividend_id,
  })

  if (error) {
    const msg = error.message || ''
    const conflict = /not in declared state/i.test(msg)
    return NextResponse.json(
      { error: conflict ? msg : msg || 'Failed to pay dividend' },
      { status: conflict ? 409 : 500 },
    )
  }

  const result = (data ?? {}) as {
    members_paid?: number
    total_paid?: number
  }

  logAudit(
    actingAdmin.id,
    AuditAction.SETTINGS_CHANGE,
    {
      operation: 'pay_dividend',
      dividend_id,
      members_paid: result.members_paid,
      total_paid: result.total_paid,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json({
    success: true,
    members_paid: result.members_paid ?? 0,
    total_paid: result.total_paid ?? 0,
  })
}
