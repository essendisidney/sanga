'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Clock, ArrowRight, Loader2, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

/**
 * InstantLoanCard
 *
 * Real instant loan entry point. Fetches live eligibility from
 * /api/loans/instant (GET) so the max amount shown is exactly what the
 * RPC will approve. If the member isn't eligible, the card tells them why
 * and disables the apply button.
 *
 * Submit posts to /api/loans/instant (POST) which atomically approves +
 * disburses + generates the repayment schedule via the process_instant_loan
 * RPC. There is no fake setTimeout — either the RPC returns a loan row or
 * it returns a reason.
 */

type Eligibility = {
  eligible: boolean
  max_amount: number
  reason?: string | null
  credit_score?: number
  savings_balance?: number
  active_loans?: number
}

export function InstantLoanCard() {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [loadingElig, setLoadingElig] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/loans/instant', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load eligibility')
        const data = await res.json()
        setEligibility(data)
      } catch (err) {
        console.error(err)
        setEligibility({ eligible: false, max_amount: 0, reason: 'Could not load eligibility' })
      } finally {
        setLoadingElig(false)
      }
    })()
  }, [])

  const maxAmount = Number(eligibility?.max_amount ?? 0)
  const amountNum = Number(amount || 0)
  const invalid = !amount || amountNum <= 0 || amountNum > maxAmount

  const presets = maxAmount > 0
    ? [
        Math.min(5000, maxAmount),
        Math.min(10000, maxAmount),
        Math.min(25000, maxAmount),
        Math.min(50000, maxAmount),
      ].filter((v, i, arr) => arr.indexOf(v) === i && v > 0)
    : []

  const handleApply = async () => {
    if (invalid) return
    setLoading(true)
    try {
      const res = await fetch('/api/loans/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, purpose: 'Instant loan', durationDays: 30 }),
      })
      const data = await res.json()
      if (!res.ok || !data.approved) {
        toast.error(data.error || data.reason || 'Loan request declined')
        return
      }
      toast.success(
        `Approved! KES ${Number(data.net_disbursed ?? data.amount).toLocaleString()} credited to your savings.`,
      )
      setAmount('')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (loadingElig) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking your eligibility…</span>
        </div>
      </div>
    )
  }

  // Not eligible state — honest and actionable, not a teaser
  if (!eligibility?.eligible) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6"
      >
        <div className="mb-3 flex items-center gap-2">
          <Lock className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-semibold tracking-wide text-gray-500">
            INSTANT LOANS · NOT YET
          </span>
        </div>
        <h3 className="mb-1 text-lg font-bold text-gray-900">Not eligible — yet</h3>
        <p className="text-sm text-gray-600">
          {eligibility?.reason ||
            'Build savings of at least KES 1,000 or a credit score of 500+ to qualify.'}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          <div>
            <div className="text-gray-400">Credit score</div>
            <div className="text-sm font-semibold text-gray-900">
              {eligibility?.credit_score ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-400">Savings</div>
            <div className="text-sm font-semibold text-gray-900">
              KES {Number(eligibility?.savings_balance ?? 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-400">Active loans</div>
            <div className="text-sm font-semibold text-gray-900">
              {eligibility?.active_loans ?? 0}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 p-6 text-white"
    >
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-6 w-6 text-yellow-300" />
        <span className="text-sm font-semibold tracking-wide">INSTANT LOANS</span>
      </div>

      <h3 className="mb-1 text-2xl font-bold">Get funds instantly</h3>
      <p className="mb-4 text-sm text-white/80">
        Atomic approval + disbursement to your SANGA savings account. No paperwork, no waiting, no guarantors.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-white/90">
        <Clock className="h-4 w-4" />
        <span>Under 10 seconds</span>
        <span className="mx-1 opacity-50">·</span>
        <span>Up to KES {maxAmount.toLocaleString()}</span>
        {eligibility.credit_score != null && (
          <>
            <span className="mx-1 opacity-50">·</span>
            <span>Your score: {eligibility.credit_score}</span>
          </>
        )}
      </div>

      {presets.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {presets.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(String(a))}
              className="rounded-lg bg-white/15 px-3 py-1 text-xs font-medium transition hover:bg-white/25"
            >
              KES {a.toLocaleString()}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Enter amount (max ${maxAmount.toLocaleString()})`}
          max={maxAmount}
          min={100}
          className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <button
          onClick={handleApply}
          disabled={loading || invalid}
          className="flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-purple-900 transition hover:bg-yellow-300 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing
            </>
          ) : (
            <>
              Apply <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}
