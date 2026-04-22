import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  // Get total members
  const { count: totalMembers } = await supabase
    .from('sacco_memberships')
    .select('*', { count: 'exact', head: true })
  
  // Get total savings
  const { data: savingsAccounts } = await supabase
    .from('member_accounts')
    .select('balance')
    .eq('account_type', 'savings')
  
  const totalSavings = savingsAccounts?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0
  
  // Get loan stats
  const { data: loans } = await supabase
    .from('loan_applications')
    .select('status, amount')
  
  const pendingLoans = loans?.filter(l => l.status === 'pending').length || 0
  const approvedLoans = loans?.filter(l => l.status === 'approved').length || 0
  const rejectedLoans = loans?.filter(l => l.status === 'rejected').length || 0
  const totalLoans = loans?.length || 0
  const totalLoanAmount = loans?.reduce((sum, l) => sum + (l.amount || 0), 0) || 0
  
  // Get recent transactions
  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('*, users(full_name)')
    .order('created_at', { ascending: false })
    .limit(10)
  
  return NextResponse.json({
    totalMembers: totalMembers || 0,
    totalSavings,
    pendingLoans,
    approvedLoans,
    rejectedLoans,
    totalLoans,
    totalLoanAmount,
    recentTransactions: recentTransactions || []
  })
}
