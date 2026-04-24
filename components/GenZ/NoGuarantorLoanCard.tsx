'use client'

import { useEffect, useState } from 'react'
import { Zap, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'

/**
 * NoGuarantorLoanCard
 *
 * Shows the member's social credit score + the loan amount they qualify
 * for without guarantors. Data comes from /api/me/credit-score, which
 * reads the social_credit_scores table populated by the trigger we wrote.
 *
 * Clicking Apply posts to /api/loans/instant (same atomic RPC as the
 * InstantLoanCard). No duplicate scoring systems.
 */
type CreditScore = {
  score: number
  band: 'excellent' | 'good' | 'fair' | 'building'
  loan_without_guarantors: number
}

export function NoGuarantorLoanCard() {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [credit, setCredit] = useState<CreditScore | null>(null)
  const [loadingCredit, setLoadingCredit] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/me/credit-score', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load credit score')
        const data = await res.json()
        setCredit(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingCredit(false)
      }
    })()
  }, [])

  const eligibility = Number(credit?.loan_without_guarantors ?? 0)
  const amountNum = Number(amount || 0)
  const invalid = !amount || amountNum <= 0 || amountNum > eligibility

  const handleApply = async () => {
    if (invalid) return
    setLoading(true)
    try {
      const res = await fetch('/api/loans/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          purpose: 'No-guarantor loan',
          durationDays: 30,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.approved) {
        toast.error(data.error || data.reason || 'Not approved')
        return
      }
      toast.success(`Approved! KES ${Number(data.net_disbursed ?? data.amount).toLocaleString()} credited.`)
      setAmount('')
    } catch (err) {
      console.error(err)
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (loadingCredit) {
    return (
      <div className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5">
        <div className="flex items-center gap-2 text-green-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading your social credit score…</span>
        </div>
      </div>
    )
  }

  // Show the "build your score" state honestly if they're not eligible
  if (eligibility <= 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-600" />
          <h3 className="font-semibold text-green-900">No-Guarantor Loans</h3>
        </div>
        <p className="text-sm text-green-800">
          Your social credit score is <strong>{credit?.score ?? '—'}</strong> ({credit?.band ?? 'building'}).
          Consistent savings and on-time repayments will unlock loans without guarantors at score 500+.
        </p>
        <p className="mt-2 flex items-start gap-1 text-xs text-green-700">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Score is computed from your real SANGA activity — deposits, transactions, and bill payment history. No external data collection.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5">
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-5 w-5 text-green-600" />
        <h3 className="font-semibold text-green-900">No Guarantor Required</h3>
      </div>
      <p className="mb-3 text-sm text-green-800">
        Your social credit score (<strong>{credit?.score}</strong> · {credit?.band}) qualifies you for up
        to <strong>KES {eligibility.toLocaleString()}</strong> without guarantors.
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Max ${eligibility.toLocaleString()}`}
          max={eligibility}
          min={100}
          className="flex-1 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={handleApply}
          disabled={loading || invalid}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> …
            </span>
          ) : (
            'Apply'
          )}
        </button>
      </div>
      <p className="mt-2 text-xs text-green-700">
        No guarantors · Instant approval · Funds in your savings account
      </p>
    </div>
  )
}
