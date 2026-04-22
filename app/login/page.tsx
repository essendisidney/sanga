'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const formatPhoneForAPI = (value: string): string => {
    let cleaned = value.replace(/\D/g, '')

    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1)
    } else if (cleaned.length === 9) {
      cleaned = '254' + cleaned
    } else if (cleaned.length === 10 && !cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1)
    }

    console.log(`Phone formatted: ${value} → ${cleaned}`)
    return cleaned
  }

  const sendOTP = async () => {
    const rawDigits = phone.replace(/\D/g, '')
    if (rawDigits.length < 9 || rawDigits.length > 12) {
      toast.error('Please enter a valid phone number (e.g., 722210711)')
      return
    }

    setLoading(true)
    const formattedPhone = formatPhoneForAPI(phone)

    try {
      const response = await fetch('/api/sms/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success('OTP sent! Check your phone')
        if (data.debugOtp) {
          console.log('Debug OTP:', data.debugOtp)
          toast.info(`Dev mode: OTP is ${data.debugOtp}`)
        }
        setStep('otp')
      } else {
        toast.error(data.error || 'Failed to send OTP')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const verifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter the 6-digit OTP')
      return
    }

    setLoading(true)
    const formattedPhone = formatPhoneForAPI(phone)

    try {
      const response = await fetch('/api/sms/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedPhone,
          otp: otp,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Welcome to Sanga!')

        // Keep legacy localStorage for existing client pages,
        // but the real auth is now the Supabase session cookie.
        localStorage.setItem(
          'sanga_user',
          JSON.stringify({
            phone: formattedPhone,
            isAuthenticated: true,
            loginTime: Date.now(),
          })
        )

        router.push('/dashboard')
      } else {
        toast.error(data.error || 'Invalid OTP')
      }
    } catch {
      toast.error('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen sanga-gradient flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-2xl backdrop-blur mb-4">
            <span className="text-3xl font-bold text-white font-heading">S</span>
          </div>
          <h1 className="text-3xl font-bold text-white font-heading">Sanga</h1>
          <p className="text-white/80 mt-2">Connecting Africa&apos;s Wealth</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {step === 'phone' ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-[#D4AF37]">
                  <span className="inline-flex items-center px-3 text-gray-500">+254</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="722210711"
                    className="flex-1 px-3 py-3 outline-none rounded-r-lg"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Enter 722210711 (without 0 or 254)
                </p>
              </div>

              <button
                onClick={sendOTP}
                disabled={loading || !phone}
                className="w-full bg-[#1A2A4F] text-white py-3 rounded-lg font-semibold hover:bg-[#243B66] disabled:opacity-50 transition-all"
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-600">We&apos;ve sent an OTP to</p>
                <p className="font-semibold text-gray-900">+254 {phone.replace(/\D/g, '')}</p>
                <p className="text-xs text-gray-400 mt-1">From Sender ID: SIDNET</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] text-center text-2xl tracking-widest"
                  autoFocus
                />
              </div>

              <button
                onClick={verifyOTP}
                disabled={loading || otp.length !== 6}
                className="w-full bg-[#1A2A4F] text-white py-3 rounded-lg font-semibold hover:bg-[#243B66] disabled:opacity-50 transition-all"
              >
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>

              <button
                onClick={() => {
                  setStep('phone')
                  setOtp('')
                }}
                className="w-full text-sm text-[#D4AF37] hover:text-[#E67E22]"
              >
                ← Back to phone number
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/70 text-xs mt-6">
          By continuing, you agree to Sanga&apos;s{' '}
          <Link href="/terms" className="underline hover:text-white transition-colors">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  )
}
