import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryGetMpesaClient } from '@/lib/mpesa/client'

// Polling endpoint for the deposit page after STK Push fires.
//
// Auth: required. Members can only see their own transactions — RLS on
// mpesa_transactions enforces this for the SELECT, and we double-check
// by filtering on member_id == auth.uid().
//
// Behaviour:
//   1. If the local row already has a terminal status, return immediately
//      (the callback has run; Daraja's status API is rate-limited so we
//      avoid hitting it when we already know the answer).
//   2. Otherwise, optionally poll Daraja's stkpushquery API and return its
//      verdict — but DO NOT credit balances from this path. Crediting
//      only happens in the callback handler so there's a single code path
//      that touches money.
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const checkoutRequestId = searchParams.get('checkoutRequestId')
  const transactionId = searchParams.get('transactionId')

  if (!checkoutRequestId && !transactionId) {
    return NextResponse.json(
      { error: 'checkoutRequestId or transactionId required' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('mpesa_transactions')
    .select('id, status, amount, mpesa_receipt, result_desc, completed_at')
    .eq('member_id', user.id)
    .limit(1)

  query = checkoutRequestId
    ? query.eq('checkout_request_id', checkoutRequestId)
    : query.eq('id', transactionId!)

  const { data: tx, error } = await query.maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  if (tx.status !== 'pending') {
    return NextResponse.json({
      status: tx.status,
      receipt: tx.mpesa_receipt,
      amount: tx.amount,
      message: tx.result_desc,
    })
  }

  // Still pending locally. Optional: query Daraja for a fresher answer.
  // We DON'T credit balances here even on success — the callback path is
  // the only writer. This call just gives the UI a more responsive answer.
  const mpesa = tryGetMpesaClient()
  if (!mpesa || !checkoutRequestId) {
    return NextResponse.json({
      status: 'pending',
      message: 'Waiting for M-Pesa confirmation...',
    })
  }

  try {
    const result = await mpesa.queryStatus(checkoutRequestId)
    return NextResponse.json({
      status: result.ResultCode === '0' ? 'completed' : 'pending',
      message: result.ResultDesc,
      remote: true,
    })
  } catch {
    return NextResponse.json({ status: 'pending', message: 'Still processing' })
  }
}
