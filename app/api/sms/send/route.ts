import { NextResponse } from 'next/server'
import { getTaifaMobile } from '@/lib/sms/taifa'

export async function POST(request: Request) {
  try {
    const { phone, message } = (await request.json()) as {
      phone?: string
      message?: string
    }

    console.log('SMS API called with:', { phone, message })

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Phone and message are required', success: false },
        { status: 400 }
      )
    }

    const taifa = getTaifaMobile()
    const result = await taifa.sendSMS(phone, message)

    console.log('SMS result:', result)

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error) {
    console.error('SMS send error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send SMS'
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    )
  }
}
