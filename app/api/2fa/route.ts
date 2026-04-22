import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as speakeasy from 'speakeasy'
import * as QRCode from 'qrcode'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `SANGA:${user.email ?? user.id}`,
  })

  if (!secret.otpauth_url) {
    return NextResponse.json(
      { error: 'Failed to generate 2FA secret' },
      { status: 500 }
    )
  }

  // Store secret temporarily
  await supabase.from('user_2fa').upsert({
    user_id: user.id,
    secret: secret.base32,
    enabled: false,
  })

  // Generate QR code
  const qrCode = await QRCode.toDataURL(secret.otpauth_url)

  return NextResponse.json({
    secret: secret.base32,
    qrCode,
  })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { token } = await request.json()

  // Get stored secret
  const { data: twoFA } = await supabase
    .from('user_2fa')
    .select('secret')
    .eq('user_id', user.id)
    .single()

  if (!twoFA?.secret) {
    return NextResponse.json(
      { error: '2FA not initialized. Call POST /api/2fa first.' },
      { status: 400 }
    )
  }

  // Verify token
  const verified = speakeasy.totp.verify({
    secret: twoFA.secret,
    encoding: 'base32',
    token: token,
  })

  if (!verified) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Enable 2FA
  await supabase.from('user_2fa').update({ enabled: true }).eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
