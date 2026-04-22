import { getRedis } from '@/lib/redis'

interface OTPRecord {
  code: string
  expiresAt: number
  attempts: number
}

// Per-instance fallback. Used only when Upstash env vars are not configured
// (e.g. local dev). On Vercel serverless this map is per-instance, so OTP
// continuity across instances requires Upstash.
const memoryStore = new Map<string, OTPRecord>()

const MAX_ATTEMPTS = 5

function keyFor(phone: string) {
  return `sanga:otp:${phone}`
}

export async function storeOTP(
  phone: string,
  code: string,
  expiryMinutes: number = 10
): Promise<void> {
  const expiresAt = Date.now() + expiryMinutes * 60 * 1000
  const record: OTPRecord = { code, expiresAt, attempts: 0 }

  const redis = getRedis()
  if (redis) {
    await redis.set(keyFor(phone), JSON.stringify(record), {
      ex: expiryMinutes * 60,
    })
    return
  }

  memoryStore.set(phone, record)
  setTimeout(() => {
    const r = memoryStore.get(phone)
    if (r && r.expiresAt === expiresAt) memoryStore.delete(phone)
  }, expiryMinutes * 60 * 1000)
}

async function readRecord(phone: string): Promise<OTPRecord | null> {
  const redis = getRedis()
  if (redis) {
    const raw = await redis.get<OTPRecord | string>(keyFor(phone))
    if (!raw) return null
    return typeof raw === 'string' ? (JSON.parse(raw) as OTPRecord) : raw
  }
  return memoryStore.get(phone) ?? null
}

async function writeRecord(phone: string, record: OTPRecord): Promise<void> {
  const redis = getRedis()
  if (redis) {
    const ttlSeconds = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000))
    await redis.set(keyFor(phone), JSON.stringify(record), { ex: ttlSeconds })
    return
  }
  memoryStore.set(phone, record)
}

async function deleteRecord(phone: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    await redis.del(keyFor(phone))
    return
  }
  memoryStore.delete(phone)
}

export async function verifyOTP(
  phone: string,
  code: string
): Promise<{ valid: boolean; message: string }> {
  const record = await readRecord(phone)

  if (!record) {
    return { valid: false, message: 'OTP not found or expired. Request a new one.' }
  }

  if (record.expiresAt < Date.now()) {
    await deleteRecord(phone)
    return { valid: false, message: 'OTP has expired. Request a new one.' }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await deleteRecord(phone)
    return { valid: false, message: 'Too many failed attempts. Request a new OTP.' }
  }

  if (record.code !== code) {
    record.attempts++
    await writeRecord(phone, record)
    const remaining = MAX_ATTEMPTS - record.attempts
    return { valid: false, message: `Invalid OTP. ${remaining} attempts remaining.` }
  }

  await deleteRecord(phone)
  return { valid: true, message: 'OTP verified successfully' }
}

// Debug helper: only meaningful for the in-memory fallback.
export function getOTPStore() {
  return memoryStore
}
