import { NextResponse } from 'next/server'

/**
 * STUB: M-Pesa B2C withdrawal ("send money to customer").
 *
 * Real implementation needs:
 *   - Daraja B2C endpoint (https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest)
 *   - MPESA_INITIATOR_NAME, MPESA_SECURITY_CREDENTIAL, MPESA_SHORTCODE env vars
 *   - A queue + the /api/mpesa/callback handler to reconcile on final status
 *
 * Contract the client depends on:
 *   200 → { success: true,  conversationID: string }
 *   !200 → { success: false, error: string }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; amount?: number }
    const { phone, amount } = body

    if (!phone || !amount || amount < 10) {
      return NextResponse.json(
        { success: false, error: 'phone and amount (>=10) required' },
        { status: 400 }
      )
    }

    console.log(`💸 B2C withdraw to ${phone} for KES ${amount}`)

    return NextResponse.json({
      success: true,
      message: 'Withdrawal initiated',
      conversationID: 'MOCK_B2C_' + Date.now(),
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Withdrawal failed' },
      { status: 500 }
    )
  }
}
