import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel Cron hits this endpoint on a schedule (see vercel.json).
// Auth model:
//   - Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically
//     when CRON_SECRET is set in the project's env vars.
//   - We use the service-role admin client because otp_codes is RLS-locked
//     to anon/auth and is only accessible to service role.
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('clean_expired_otps')

  if (error) {
    console.error('[cron:cleanup-otp] failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const deleted = typeof data === 'number' ? data : 0
  console.log(`[cron:cleanup-otp] deleted=${deleted}`)

  return NextResponse.json({
    success: true,
    message: 'Expired OTPs cleaned up',
    deleted,
  })
}
