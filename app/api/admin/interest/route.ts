import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

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
    effective_rate: account.balance > 0 ? ((totalInterest / account.balance) * 100) : 0
  })
}

export async function PUT(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  await request.json().catch(() => ({}))
  
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
  
  return NextResponse.json({
    success: true,
    accounts_processed: results.length,
    total_interest: results.reduce((sum, r) => sum + r.interest, 0),
    details: results
  })
}
