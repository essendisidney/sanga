'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Phone, Shield, Zap, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type SangaUser = { phone: string; isAuthenticated: boolean; loginTime: number }
type DepositStatus = 'idle' | 'sending' | 'awaiting' | 'completed' | 'failed'

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000, 50000]
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 40 // ~2 minutes; STK Push usually resolves in <60s

export default function DepositPage() {
  const [amount, setAmount] = useState('')
  const [user, setUser] = useState<SangaUser | null>(null)
  const [status, setStatus] = useState<DepositStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const router = useRouter()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('sanga_user')
    if (!raw) return router.push('/login')
    try {
      const p = JSON.parse(raw) as Partial<SangaUser>
      if (!p.isAuthenticated || typeof p.phone !== 'string') return router.push('/login')
      setUser({ phone: p.phone, isAuthenticated: true, loginTime: p.loginTime ?? 0 })
    } catch {
      router.push('/login')
    }
  }, [router])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = (checkoutRequestId: string) => {
    let attempts = 0
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const res = await fetch(
          `/api/mpesa/status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`
        )
        const data = await res.json()

        if (data.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current)
          setStatus('completed')
          setReceipt(data.receipt ?? null)
          setStatusMessage(`Receipt: ${data.receipt ?? '—'}`)
          toast.success(`Deposit confirmed: KES ${data.amount?.toLocaleString?.() ?? amount}`)
          setTimeout(() => router.push('/dashboard'), 2500)
        } else if (data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          setStatus('failed')
          setStatusMessage(data.message ?? 'Payment failed')
          toast.error(data.message ?? 'Payment failed')
        }
      } catch {
        // Silent — polling will retry on next tick.
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current)
        if (status !== 'completed' && status !== 'failed') {
          setStatusMessage(
            'Still waiting for M-Pesa. Check your transaction history shortly.'
          )
        }
      }
    }, POLL_INTERVAL_MS)
  }

  const handleDeposit = async () => {
    if (!user) return
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount < 10) {
      toast.error('Enter valid amount (min KES 10)')
      return
    }
    if (numAmount > 500_000) {
      toast.error('Maximum deposit is KES 500,000')
      return
    }

    setStatus('sending')
    setStatusMessage('Initiating M-Pesa request...')
    setReceipt(null)

    try {
      const res = await fetch('/api/mpesa/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmount }),
      })
      const data = await res.json()

      if (!data.success || !data.checkoutRequestId) {
        setStatus('failed')
        setStatusMessage(data.error ?? 'Payment failed')
        toast.error(data.error ?? 'Payment failed')
        return
      }

      setStatus('awaiting')
      setStatusMessage('STK Push sent. Enter your M-Pesa PIN on your phone.')
      toast.success('STK Push sent! Check your phone.')
      startPolling(data.checkoutRequestId)
    } catch {
      setStatus('failed')
      setStatusMessage('Network error. Please try again.')
      toast.error('Network error')
    }
  }

  const isBusy = status === 'sending' || status === 'awaiting'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-1" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Deposit via M-Pesa</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-6 border border-green-200">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Secure M-Pesa Payment</p>
              <p className="text-xs text-green-700">
                You will receive an STK Push on your registered M-Pesa number
                {user?.phone ? ` (${user.phone})` : ''}.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount (KES)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg mb-4"
            disabled={isBusy}
            autoFocus
          />

          <div className="grid grid-cols-4 gap-2 mb-6">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                disabled={isBusy}
                className="py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                {preset.toLocaleString()}
              </button>
            ))}
          </div>

          <button
            onClick={handleDeposit}
            disabled={isBusy || !amount || !user}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {status === 'sending' || status === 'awaiting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {status === 'sending' ? 'Sending request…' : 'Awaiting payment…'}
              </>
            ) : status === 'completed' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Deposit KES {Number(amount || 0).toLocaleString()}
              </>
            )}
          </button>

          {statusMessage && (
            <div
              className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
                status === 'completed'
                  ? 'bg-green-50 text-green-800'
                  : status === 'failed'
                  ? 'bg-red-50 text-red-800'
                  : 'bg-blue-50 text-blue-800'
              }`}
            >
              {status === 'completed' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : status === 'failed' ? (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <Phone className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">How it works:</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Enter amount and tap Deposit</li>
            <li>Check your phone for the M-Pesa prompt</li>
            <li>Enter your M-Pesa PIN</li>
            <li>Funds reflect in your savings within seconds</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
