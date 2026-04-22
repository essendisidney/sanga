import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { data: dividends } = await supabase
    .from('dividends')
    .select('*, member_dividends(*)')
    .order('declared_date', { ascending: false })
  
  return NextResponse.json(dividends || [])
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = await request.json()
  const { rate, financial_year } = body
  
  // Get all members with share capital
  const { data: members } = await supabase
    .from('member_accounts')
    .select('*, sacco_memberships(user_id)')
    .eq('account_type', 'share_capital')
  
  // Calculate total share capital
  const totalShareCapital = members?.reduce((sum, m) => sum + (m.balance || 0), 0) || 0
  const totalDividend = totalShareCapital * (rate / 100)
  
  // Create dividend record
  const { data: dividend, error } = await supabase
    .from('dividends')
    .insert({
      financial_year: financial_year,
      dividend_rate: rate,
      total_share_capital: totalShareCapital,
      total_dividend_amount: totalDividend,
      declared_date: new Date().toISOString(),
      status: 'declared'
    })
    .select()
    .single()
  
  if (error || !dividend) {
    return NextResponse.json(
      { error: error?.message || 'Failed to declare dividend' },
      { status: 500 }
    )
  }
  
  // Calculate individual dividends
  for (const member of members || []) {
    const memberDividend = member.balance * (rate / 100)
    const withholdingTax = memberDividend * 0.05 // 5% withholding tax
    const netAmount = memberDividend - withholdingTax
    
    await supabase
      .from('member_dividends')
      .insert({
        dividend_id: dividend.id,
        user_id: member.sacco_memberships?.user_id,
        share_capital: member.balance,
        dividend_amount: memberDividend,
        withholding_tax: withholdingTax,
        net_amount: netAmount,
        status: 'pending'
      })
  }
  
  return NextResponse.json(dividend)
}

export async function PUT(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = await request.json()
  const { dividend_id } = body
  
  // Get all pending dividends
  const { data: memberDividends } = await supabase
    .from('member_dividends')
    .select('*')
    .eq('dividend_id', dividend_id)
    .eq('paid', false)
  
  // Process payouts
  for (const md of memberDividends || []) {
    // Add to member's savings account
    const { data: savingsAccount } = await supabase
      .from('member_accounts')
      .select('*')
      .eq('user_id', md.user_id)
      .eq('account_type', 'savings')
      .single()
    
    if (savingsAccount) {
      await supabase
        .from('member_accounts')
        .update({ balance: savingsAccount.balance + md.net_amount })
        .eq('id', savingsAccount.id)
      
      // Record transaction
      await supabase
        .from('transactions')
        .insert({
          user_id: md.user_id,
          member_account_id: savingsAccount.id,
          type: 'dividend',
          amount: md.net_amount,
          balance_before: savingsAccount.balance,
          balance_after: savingsAccount.balance + md.net_amount,
          status: 'completed',
          description: `Dividend payment for ${dividend_id}`,
          completed_at: new Date().toISOString()
        })
      
      // Mark as paid
      await supabase
        .from('member_dividends')
        .update({ paid: true, paid_date: new Date().toISOString() })
        .eq('id', md.id)
    }
  }
  
  // Update dividend status
  await supabase
    .from('dividends')
    .update({ status: 'paid', payment_date: new Date().toISOString() })
    .eq('id', dividend_id)
  
  return NextResponse.json({ success: true })
}
