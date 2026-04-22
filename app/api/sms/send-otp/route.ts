import { NextResponse } from 'next/server'
import { getTaifaMobile } from '@/lib/sms/taifa'
import { storeOTP } from '@/lib/sms/otp-store'

export async function POST(request: Request) {
  try {
    const { phone } = await request.json()
    
    if (!phone) {
      return NextResponse.json({ error: 'Phone required', success: false }, { status: 400 })
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Store with 10 minute expiry (increased from 5)
    await storeOTP(phone, otp, 10)
    
    console.log(`📞 OTP for ${phone}: ${otp}`)
    
    // Try to send SMS
    try {
      const taifa = getTaifaMobile()
      await taifa.sendOTP(phone, otp)
      console.log('✅ SMS sent successfully')
    } catch (smsError) {
      console.warn('⚠️ SMS failed, but OTP is stored:', smsError)
    }
    
    return NextResponse.json({
      success: true,
      message: 'OTP sent. Valid for 10 minutes.',
      debugOtp: process.env.NODE_ENV === 'development' ? otp : undefined
    })
  } catch (error) {
    console.error('❌ OTP error:', error)
    return NextResponse.json({ error: 'Failed to send OTP', success: false }, { status: 500 })
  }
}
