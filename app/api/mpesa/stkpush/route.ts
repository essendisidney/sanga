import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { phone, amount } = await request.json()
    console.log(`STK Push to ${phone} for KES ${amount}`)
    // TODO: Replace with actual M-Pesa API call
    return NextResponse.json({ success: true, message: 'STK Push sent', checkoutRequestID: 'MOCK_' + Date.now() })
  } catch (error) {
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 })
  }
}
