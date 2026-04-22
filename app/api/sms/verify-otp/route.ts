import { NextResponse } from 'next/server'
import { otpStore } from '../send-otp/route'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; otp?: string }
    const { phone, otp } = body

    console.log('🔐 OTP Verification request:', { phone, otp })

    if (!phone || !otp) {
      return NextResponse.json(
        { error: 'Phone and OTP are required', success: false },
        { status: 400 }
      )
    }

    const storedOtp = otpStore.get(phone)

    if (!storedOtp) {
      return NextResponse.json(
        { error: 'OTP not found or expired. Request a new one.', success: false },
        { status: 400 }
      )
    }

    if (storedOtp.expiresAt < Date.now()) {
      otpStore.delete(phone)
      return NextResponse.json(
        { error: 'OTP has expired. Request a new one.', success: false },
        { status: 400 }
      )
    }

    if (storedOtp.code !== otp) {
      return NextResponse.json(
        { error: 'Invalid OTP. Please try again.', success: false },
        { status: 400 }
      )
    }

    otpStore.delete(phone)

    console.log('✅ OTP verified successfully for:', phone)

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
      user: { phone, isAuthenticated: true },
    })
  } catch (error) {
    console.error('❌ OTP verification error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to verify OTP',
        success: false,
      },
      { status: 500 }
    )
  }
}
