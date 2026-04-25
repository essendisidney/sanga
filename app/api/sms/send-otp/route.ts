import { NextResponse } from 'next/server'
import { getTaifaMobile } from '@/lib/sms/taifa'
import { storeOTP, getStoreBackend } from '@/lib/sms/otp-store'

export async function POST(request: Request) {
  try {
    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json({ error: 'Phone required', success: false }, { status: 400 })
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Persist BEFORE sending. If storage fails we never tell the user the
    // SMS is in flight — avoids "I got the code but verify says invalid"
    // when the row didn't actually land.
    await storeOTP(phone, otp, 10)

    // Backend tag stays in logs as a tripwire: if it ever reads "memory"
    // on Vercel, SUPABASE_SERVICE_ROLE_KEY is missing and OTPs will flap.
    console.log(`[otp:send] backend=${getStoreBackend()} phone=${phone}`)

    try {
      const taifa = getTaifaMobile()
      await taifa.sendOTP(phone, otp)
    } catch (smsError) {
      console.warn(`[otp:send] sms_failed phone=${phone}`, smsError)
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent. Valid for 10 minutes.',
      debugOtp: process.env.NODE_ENV === 'development' ? otp : undefined,
    })
  } catch (error) {
    console.error('[otp:send] error', error)
    return NextResponse.json({ error: 'Failed to send OTP', success: false }, { status: 500 })
  }
}
