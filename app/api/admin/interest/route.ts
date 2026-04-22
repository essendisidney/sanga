import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const body = await request.json()
  const { account_id, days = 30 } = body

  // Get account details
  const { data: account } = await supabase
    .from('member_accounts')
    .select('*')
    .eq('id', account_id)
    .single()

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Calculate interest (daily compounding)
  const dailyRate = account.interest_rate / 100 / 365
  let balance = account.balance
  let totalInterest = 0

  for (let i = 0; i < days; i++) {
    const dailyInterest = balance * dailyRate
    totalInterest += dailyInterest
    balance += dailyInterest // Compound daily
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

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const body = await request.json().catch(() => ({} as any))
  const now = new Date()
  const period_year: number = body.period_year ?? now.getFullYear()
  const period_month: number = body.period_month ?? now.getMonth() + 1

  // Replay guard: reserve this (year, month) in interest_postings. The unique
  // constraint makes concurrent / repeated calls fail fast instead of
  // double-crediting every account.
  const reservation = await supabase
    .from('interest_postings')
    .insert({
      period_year,
      period_month,
      posted_by: actingAdmin.id,
      accounts_count: 0,
      total_interest: 0,
    })
    .select()
    .single()

  if (reservation.error) {
    const msg = reservation.error.message || ''
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

  // Post interest to all savings accounts
  const { data: accounts } = await supabase
    .from('member_accounts')
    .select('*')
    .eq('account_type', 'savings')

  const results = []

  for (const account of accounts || []) {
    const dailyRate = account.interest_rate / 100 / 365
    const monthlyInterest = account.balance * dailyRate * 30

    // Add interest to account
    await supabase
      .from('member_accounts')
      .update({
        balance: account.balance + monthlyInterest,
        updated_at: new Date().toISOString()
      })
      .eq('id', account.id)

    // Record interest transaction
    await supabase
      .from('transactions')
      .insert({
        user_id: account.user_id,
        member_account_id: account.id,
        type: 'interest',
        amount: monthlyInterest,
        balance_before: account.balance,
        balance_after: account.balance + monthlyInterest,
        status: 'completed',
        description: `Monthly interest at ${account.interest_rate}%`,
        completed_at: new Date().toISOString()
      })

    results.push({
      account_id: account.id,
      interest: monthlyInterest,
      new_balance: account.balance + monthlyInterest
    })
  }

  const totalInterest = results.reduce((sum, r) => sum + r.interest, 0)

  // Update the reservation row with the final tallies
  await supabase
    .from('interest_postings')
    .update({
      accounts_count: results.length,
      total_interest: totalInterest,
    })
    .eq('id', reservation.data?.id)

  logAudit(
    actingAdmin.id,
    AuditAction.SETTINGS_CHANGE,
    {
      operation: 'post_monthly_interest',
      period_year,
      period_month,
      posting_id: reservation.data?.id,
      accounts_processed: results.length,
      total_interest: totalInterest,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json({
    success: true,
    period: `${period_year}-${String(period_month).padStart(2, '0')}`,
    accounts_processed: results.length,
    total_interest: totalInterest,
    details: results
  })
}
