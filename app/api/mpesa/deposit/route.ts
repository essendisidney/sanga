import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string
      amount?: number
      mpesaReceipt?: string
    }

    const { userId, amount, mpesaReceipt } = body

    if (!userId || !amount || amount <= 0 || !mpesaReceipt) {
      return NextResponse.json(
        { error: 'userId, amount (>0), mpesaReceipt are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Get user's savings account
    const membership = await supabase
      .from('sacco_memberships')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (membership.error || !membership.data) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }

    const account = await supabase
      .from('member_accounts')
      .select('id, balance')
      .eq('sacco_membership_id', membership.data.id)
      .eq('account_type', 'savings')
      .single()

    if (account.error || !account.data) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const currentBalance = Number(account.data.balance ?? 0)
    const newBalance = currentBalance + amount

    // Update balance
    const updated = await supabase
      .from('member_accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', account.data.id)

    if (updated.error) {
      return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
    }

    // Record transaction
    const transaction = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        member_account_id: account.data.id,
        type: 'deposit',
        amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: 'completed',
        mpesa_receipt: mpesaReceipt,
        description: 'M-Pesa Deposit',
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (transaction.error) {
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transaction: transaction.data,
      newBalance,
    })
  } catch (error) {
    console.error('Deposit error:', error)
    return NextResponse.json({ error: 'Deposit failed' }, { status: 500 })
  }
}

