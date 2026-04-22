import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  console.log('M-Pesa Callback:', body)
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
}
