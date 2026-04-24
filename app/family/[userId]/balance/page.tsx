'use client'

import { useEffect, useState, use as usePromise } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Eye, Wallet, Coins, FileText } from 'lucide-react'
import BottomNav from '@/components/BottomNav'

type Balance = {
  full_name: string
  savings: number
  shares: number
  loan_balance: number
  total: number
  relationship: string
}

export default function FamilyBalancePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = usePromise(params)
  const router = useRouter()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/me/family-balance/${userId}`, {
          cache: 'no-store',
        })
        if (res.status === 401) {
          router.replace('/login')
          return
        }
        if (res.status === 404) {
          toast.error('You do not have permission to view this balance.')
          router.replace('/family')
          return
        }
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Failed to load')
        if (!cancelled) setBalance(data)
      } catch (err: any) {
        toast.error(err?.message ?? 'Failed to load balance')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, router])

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
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">
              {balance?.full_name ?? 'Family member'}
            </h1>
            <p className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Shared balance · you cannot transact on this account
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-28 rounded-2xl" />
            <div className="skeleton h-20 rounded-2xl" />
          </div>
        ) : balance ? (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-6 text-white shadow-lg">
              <p className="text-xs uppercase tracking-wide text-white/70">
                Total balance
              </p>
              <p className="mt-1 text-3xl font-bold">
                KES {balance.total.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-white/70">
                Shared by {balance.full_name} ({balance.relationship})
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="card-luxury p-4">
                <Wallet className="h-4 w-4 text-emerald-600" />
                <p className="mt-2 text-xs text-gray-500">Savings</p>
                <p className="text-base font-semibold text-gray-900">
                  KES {balance.savings.toLocaleString()}
                </p>
              </div>
              <div className="card-luxury p-4">
                <Coins className="h-4 w-4 text-amber-600" />
                <p className="mt-2 text-xs text-gray-500">Shares</p>
                <p className="text-base font-semibold text-gray-900">
                  KES {balance.shares.toLocaleString()}
                </p>
              </div>
              <div className="card-luxury p-4">
                <FileText className="h-4 w-4 text-red-600" />
                <p className="mt-2 text-xs text-gray-500">Loan</p>
                <p className="text-base font-semibold text-gray-900">
                  KES {balance.loan_balance.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              You're viewing this balance because {balance.full_name} granted you
              permission via a family link. They can revoke it at any time.
              Transaction history and account changes stay private.
            </div>
          </>
        ) : null}
      </div>

      <BottomNav />
    </div>
  )
}
