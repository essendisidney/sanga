// Shared in-memory OTP store
interface OTPRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OTPRecord>();

export function storeOTP(phone: string, code: string, expiryMinutes: number = 10): void {
  // Increased from 5 to 10 minutes
  const expiresAt = Date.now() + expiryMinutes * 60 * 1000;
  otpStore.set(phone, { code, expiresAt, attempts: 0 });
  
  // Cleanup after expiry
  setTimeout(() => {
    const record = otpStore.get(phone);
    if (record && record.expiresAt === expiresAt) {
      otpStore.delete(phone);
    }
  }, expiryMinutes * 60 * 1000);
}

export function verifyOTP(phone: string, code: string): { valid: boolean; message: string } {
  const record = otpStore.get(phone);
  
  if (!record) {
    return { valid: false, message: 'OTP not found or expired. Request a new one.' };
  }
  
  if (record.expiresAt < Date.now()) {
    otpStore.delete(phone);
    return { valid: false, message: 'OTP has expired. Request a new one.' };
  }
  
  if (record.attempts >= 5) {
    otpStore.delete(phone);
    return { valid: false, message: 'Too many failed attempts. Request a new OTP.' };
  }
  
  if (record.code !== code) {
    record.attempts++;
    const remaining = 5 - record.attempts;
    return { valid: false, message: `Invalid OTP. ${remaining} attempts remaining.` };
  }
  
  // Valid OTP
  otpStore.delete(phone);
  return { valid: true, message: 'OTP verified successfully' };
}

export function getOTPStore() {
  return otpStore;
}
