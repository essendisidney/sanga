'use client'

import { ArrowLeft, Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { InstantLoanCard } from '@/components/GenZ/InstantLoanCard'
import { NoGuarantorLoanCard } from '@/components/GenZ/NoGuarantorLoanCard'

/**
 * Instant loans landing page.
 *
 * Surfaces two real entry points into the same atomic RPC:
 *   - InstantLoanCard: uses the savings/credit-based rule engine
 *   - NoGuarantorLoanCard: uses the social credit score
 *
 * Both ultimately call /api/loans/instant which executes the
 * process_instant_loan() RPC — a single source of truth for eligibility
 * and disbursement. No duplicate scoring, no fake approval timers.
 */
export default function InstantLoansPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pb-24">
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="rounded-full p-2 transition hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Instant loans</h1>
            <p className="text-xs text-gray-500">No paperwork · Atomic approval + disbursement</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5 sm:px-6">
        <InstantLoanCard />
        <NoGuarantorLoanCard />

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">How your limit is computed</p>
              <p className="mt-1 text-blue-800">
                We use your actual savings balance, your SANGA credit score, and your repayment
                history — no external data brokers, no social graph scraping. Maximum instant limit
                is KES 100,000 and you can have at most three active loans.
              </p>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
