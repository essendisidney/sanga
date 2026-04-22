import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; amount?: number }
    const { phone, amount } = body

    // TODO: Replace with actual M-Pesa API call
    // For now, mock success
    console.log(`STK Push to ${phone} for KES ${amount}`)

    return NextResponse.json({
      success: true,
      message: 'STK Push sent',
      checkoutRequestID: 'MOCK_' + Date.now(),
    })
  } catch {
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 })
  }
}
