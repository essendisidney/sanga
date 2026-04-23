import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const body = await request.json()
  const { account_id, days = 30 } = body

  const { data: account } = await supabase
    .from('member_accounts')
    .select('*')
    .eq('id', account_id)
    .single()

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const dailyRate = account.interest_rate / 100 / 365
  let balance = account.balance
  let totalInterest = 0

  for (let i = 0; i < days; i++) {
    const dailyInterest = balance * dailyRate
    totalInterest += dailyInterest
    balance += dailyInterest
  }

  return NextResponse.json({
    principal: account.balance,
    interest_rate: account.interest_rate,
    days: days,
    interest_earned: totalInterest,
    new_balance: balance,
    effective_rate: account.balance ? (totalInterest / account.balance) * 100 : 0,
  })
}

// Post monthly interest to every savings account.
//
// Delegates to the post_monthly_interest() SQL function so the whole batch
// runs in a single transaction: if any account update fails, every prior
// credit is rolled back and the interest_postings reservation row goes with
// it. Safe to retry. The per-period unique constraint still prevents double
// crediting on concurrent calls.
export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const body = await request.json().catch(() => ({} as any))
  const now = new Date()
  const period_year: number = body.period_year ?? now.getFullYear()
  const period_month: number = body.period_month ?? now.getMonth() + 1

  const { data, error } = await supabase.rpc('post_monthly_interest', {
    p_year: period_year,
    p_month: period_month,
  })

  if (error) {
    const msg = error.message || ''
    const alreadyPosted = /duplicate|unique/i.test(msg)
    return NextResponse.json(
      {
        error: alreadyPosted
          ? `Interest already posted for ${period_year}-${String(period_month).padStart(2, '0')}`
          : msg,
      },
      { status: alreadyPosted ? 409 : 500 },
    )
  }

  const result = (data ?? {}) as {
    posting_id?: string
    accounts_processed?: number
    total_interest?: number
  }

  logAudit(
    actingAdmin.id,
    AuditAction.SETTINGS_CHANGE,
    {
      operation: 'post_monthly_interest',
      period_year,
      period_month,
      posting_id: result.posting_id,
      accounts_processed: result.accounts_processed,
      total_interest: result.total_interest,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json({
    success: true,
    period: `${period_year}-${String(period_month).padStart(2, '0')}`,
    accounts_processed: result.accounts_processed ?? 0,
    total_interest: result.total_interest ?? 0,
  })
}
