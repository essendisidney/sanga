import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = (await request.json()) as unknown
  console.log('M-Pesa Callback:', body)

  // Update transaction in database
  // For now, just log

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
}
