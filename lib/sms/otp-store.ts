import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

interface OTPRecord {
  code: string
  expiresAt: number
  attempts: number
}

// Per-process fallback used ONLY when SUPABASE_SERVICE_ROLE_KEY is missing
// (typically a misconfigured local dev env). On Vercel serverless this
// fallback is per-instance and will silently break OTP verification across
// instances, so getStoreBackend() surfaces "memory" in logs as a red flag.
const memoryStore = new Map<string, OTPRecord>()

const MAX_ATTEMPTS = 5

function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL)
}

// Reports which store is active. If this returns "memory" on Vercel, the
// service role key is missing and OTPs will flap across instances.
export function getStoreBackend(): 'database' | 'memory' {
  return hasServiceRole() ? 'database' : 'memory'
}

export async function storeOTP(
  phone: string,
  code: string,
  expiryMinutes: number = 10
): Promise<void> {
  const expiresAtMs = Date.now() + expiryMinutes * 60 * 1000

  if (!hasServiceRole()) {
    memoryStore.set(phone, { code, expiresAt: expiresAtMs, attempts: 0 })
    setTimeout(() => {
      const r = memoryStore.get(phone)
      if (r && r.expiresAt === expiresAtMs) memoryStore.delete(phone)
    }, expiryMinutes * 60 * 1000)
    return
  }

  const admin = createAdminClient()

  // Invalidate any prior unused OTPs for this phone. Done as DELETE rather
  // than UPDATE is_used=true so the active-row index stays small.
  const { error: deleteError } = await admin
    .from('otp_codes')
    .delete()
    .eq('phone', phone)

  if (deleteError) {
    throw new Error(`otp-store: failed to clear previous OTPs: ${deleteError.message}`)
  }

  const { error: insertError } = await admin.from('otp_codes').insert({
    phone,
    code,
    expires_at: new Date(expiresAtMs).toISOString(),
    attempts: 0,
  })

  if (insertError) {
    throw new Error(`otp-store: failed to store OTP: ${insertError.message}`)
  }
}

export async function verifyOTP(
  phone: string,
  code: string
): Promise<{ valid: boolean; message: string }> {
  if (!hasServiceRole()) {
    return verifyFromMemory(phone, code)
  }

  const admin = createAdminClient()

  const { data: record, error: findError } = await admin
    .from('otp_codes')
    .select('id, code, attempts, expires_at, is_used')
    .eq('phone', phone)
    .eq('is_used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) {
    throw new Error(`otp-store: lookup failed: ${findError.message}`)
  }

  if (!record) {
    return { valid: false, message: 'OTP not found or expired. Request a new one.' }
  }

  const expiresAtMs = new Date(record.expires_at as string).getTime()
  if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
    await admin.from('otp_codes').delete().eq('id', record.id)
    return { valid: false, message: 'OTP has expired. Request a new one.' }
  }

  if ((record.attempts ?? 0) >= MAX_ATTEMPTS) {
    await admin.from('otp_codes').delete().eq('id', record.id)
    return { valid: false, message: 'Too many failed attempts. Request a new OTP.' }
  }

  if (record.code !== code) {
    const nextAttempts = (record.attempts ?? 0) + 1
    await admin
      .from('otp_codes')
      .update({ attempts: nextAttempts })
      .eq('id', record.id)
    const remaining = MAX_ATTEMPTS - nextAttempts
    return { valid: false, message: `Invalid OTP. ${remaining} attempts remaining.` }
  }

  // Mark used (preserves audit trail) and clean up older rows for this phone.
  await admin
    .from('otp_codes')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('id', record.id)

  return { valid: true, message: 'OTP verified successfully' }
}

function verifyFromMemory(
  phone: string,
  code: string
): { valid: boolean; message: string } {
  const record = memoryStore.get(phone) ?? null

  if (!record) {
    return { valid: false, message: 'OTP not found or expired. Request a new one.' }
  }

  if (record.expiresAt < Date.now()) {
    memoryStore.delete(phone)
    return { valid: false, message: 'OTP has expired. Request a new one.' }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    memoryStore.delete(phone)
    return { valid: false, message: 'Too many failed attempts. Request a new OTP.' }
  }

  if (record.code !== code) {
    record.attempts++
    memoryStore.set(phone, record)
    const remaining = MAX_ATTEMPTS - record.attempts
    return { valid: false, message: `Invalid OTP. ${remaining} attempts remaining.` }
  }

  memoryStore.delete(phone)
  return { valid: true, message: 'OTP verified successfully' }
}

// Debug helper: only meaningful for the in-memory fallback.
export function getOTPStore() {
  return memoryStore
}
