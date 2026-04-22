import { NextResponse } from 'next/server'

/**
 * M-Pesa STK-push callback receiver.
 *
 * Currently a stub: logs the Safaricom payload and acknowledges it so Daraja
 * stops retrying. No account is credited here because the upstream
 * `/api/mpesa/stkpush` route is also a stub (returns `MOCK_<timestamp>` as the
 * CheckoutRequestID instead of hitting Daraja), so there's no pending request
 * to reconcile against.
 *
 * When the real integration lands, this handler should:
 *   1. Parse `Body.stkCallback.ResultCode` and extract `CallbackMetadata`
 *      (Amount, MpesaReceiptNumber, PhoneNumber, TransactionDate).
 *   2. Look up the pending STK push by CheckoutRequestID and resolve to a
 *      `member_account_id`.
 *   3. Call `supabase.rpc('process_teller_transaction', {...})` to credit
 *      atomically (reuse the existing RPC — it already locks and logs).
 *   4. POST to /api/email/send with type='deposit' using the M-Pesa receipt
 *      number as the `receipt` field.
 */
export async function POST(request: Request) {
  const body = await request.json()
  console.log('M-Pesa Callback:', JSON.stringify(body))
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
}
