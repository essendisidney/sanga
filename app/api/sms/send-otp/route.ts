import { NextResponse } from 'next/server'
import { otpStore } from '@/lib/sms/otp-store'

export async function POST(request: Request) {
  try {
    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone required', success: false },
        { status: 400 }
      )
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + 5 * 60 * 1000

    otpStore.set(phone, { code: otp, expiresAt })

    console.log(`🔐 OTP for ${phone}: ${otp}`)

    try {
      const { getTaifaMobile } = await import('@/lib/sms/taifa')
      const taifa = getTaifaMobile()
      await taifa.sendOTP(phone, otp, 5)
      console.log('✅ SMS sent via Taifa Mobile')
    } catch (smsError) {
      const message =
        smsError instanceof Error ? smsError.message : String(smsError)
      console.warn('⚠️ SMS failed, but OTP is stored for testing:', message)
    }

    setTimeout(() => {
      if (otpStore.get(phone)?.expiresAt === expiresAt) {
        otpStore.delete(phone)
      }
    }, 5 * 60 * 1000)

    return NextResponse.json({
      success: true,
      message: 'OTP sent',
      // Only expose the OTP back to the client in development, so we can still
      // log in when SMS delivery is flaky. In production this field is absent.
      ...(process.env.NODE_ENV !== 'production' ? { debugOtp: otp } : {}),
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed', success: false },
      { status: 500 }
    )
  }
}
