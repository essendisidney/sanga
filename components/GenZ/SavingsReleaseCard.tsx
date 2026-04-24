'use client'

import { useEffect, useState } from 'react'
import { Unlock, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * SavingsReleaseCard
 *
 * Renders ONLY when the member has an active loan AND their eligibility
 * check returns a non-zero max_releasable. Fetches live eligibility from
 * /api/loans/partial-release so the limit shown is always real.
 *
 * On submit, POSTs to /api/loans/partial-release which calls the
 * request_partial_release RPC. Funds require admin approval — we do NOT
 * lie to the user and say they're instant.
 */
type Eligibility = {
  eligible: boolean
  savings_balance: number
  loan_balance: number
  max_releasable: number
  pct_cap: number
  reason?: string
} | null

type HistoryRow = {
  id: string
  requested_amount: number
  released_amount: number | null
  status: 'pending' | 'approved' | 'rejected' | 'disbursed' | 'cancelled'
  created_at: string
}

export function SavingsReleaseCard({ loanId }: { loanId?: string }) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [eligibility, setEligibility] = useState<Eligibility>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loadingEligibility, setLoadingEligibility] = useState(true)

  const loadEligibility = async () => {
    try {
      const res = await fetch('/api/loans/partial-release', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load eligibility')
      const data = await res.json()
      setEligibility(data.eligibility)
      setHistory(data.history || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingEligibility(false)
    }
  }

  useEffect(() => {
    loadEligibility()
  }, [])

  if (loadingEligibility) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
        <div className="flex items-center gap-2 text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking your release eligibility…</span>
        </div>
      </div>
    )
  }

  if (!eligibility || eligibility.max_releasable <= 0) {
    return null
  }

  const maxRelease = Number(eligibility.max_releasable ?? 0)
  const amountNum = Number(amount || 0)
  const invalid = !amount || amountNum <= 0 || amountNum > maxRelease
  const pendingRow = history.find((h) => h.status === 'pending')

  const handleSubmit = async () => {
    if (invalid) return
    setLoading(true)
    try {
      const res = await fetch('/api/loans/partial-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, loanId, reason: 'Member-initiated partial release' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Request failed')
        return
      }
      toast.success('Release request submitted — an admin will review it shortly')
      setAmount('')
      loadEligibility()
    } catch (err) {
      console.error(err)
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Unlock className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-amber-900">Unlock Your Savings</h3>
      </div>
      <p className="mb-3 text-sm text-amber-800">
        You can release up to{' '}
        <strong>KES {maxRelease.toLocaleString()}</strong> while keeping your
        loan active.
      </p>
      {pendingRow ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-white/60 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            You have a release of KES {Number(pendingRow.requested_amount).toLocaleString()} pending admin approval.
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max ${maxRelease.toLocaleString()}`}
              className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              max={maxRelease}
              min={1}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || invalid}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Submitting…
                </span>
              ) : (
                'Request'
              )}
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3 w-3" />
            Requires admin approval. Your savings stay pledged against the loan until approved.
          </p>
        </>
      )}

      {history.length > 0 && (
        <details className="mt-3 text-xs text-amber-900">
          <summary className="cursor-pointer font-medium">Recent requests</summary>
          <ul className="mt-2 space-y-1">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span>
                  KES {Number(h.requested_amount).toLocaleString()}
                  <span className="ml-2 text-amber-700/70">
                    {new Date(h.created_at).toLocaleDateString()}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    h.status === 'disbursed'
                      ? 'bg-green-100 text-green-700'
                      : h.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : h.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {h.status === 'disbursed' && <CheckCircle2 className="inline h-3 w-3" />} {h.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
