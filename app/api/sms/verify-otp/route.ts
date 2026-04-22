import { NextResponse } from 'next/server'
import { verifyOTP } from '@/lib/sms/otp-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

    const result = await verifyOTP(phone, otp)
    if (!result.valid) {
      return NextResponse.json(
        { error: result.message, success: false },
        { status: 400 }
      )
    }

    console.log('✅ OTP verified successfully for:', phone)

    // Mint a Supabase session (Taifa OTP -> Supabase magiclink)
    const email = `u${phone}@phone.sanga`
    const admin = createAdminClient()

    // Ensure user exists
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { phone },
    })

    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (link.error) {
      return NextResponse.json(
        { error: link.error.message, success: false },
        { status: 500 }
      )
    }

    const props = (link.data as any)?.properties as any
    const emailOtp = props?.email_otp ?? props?.otp

    if (!emailOtp) {
      return NextResponse.json(
        { error: 'Failed to mint session (missing otp)', success: false },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const session = await supabase.auth.verifyOtp({
      email,
      token: emailOtp,
      type: 'magiclink',
    })

    if (session.error) {
      return NextResponse.json(
        { error: session.error.message, success: false },
        { status: 500 }
      )
    }

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
