'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, FileText } from 'lucide-react'

type SangaUser = {
  phone: string
  isAuthenticated: boolean
  loginTime: number
}

type LoanApplication = {
  id: string
  phone: string
  amount: number
  purpose: string
  duration: number
  status: 'pending' | 'approved' | 'rejected' | 'disbursed'
  appliedAt: number
}

const statusStyles: Record<LoanApplication['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  disbursed: 'bg-green-100 text-green-700',
}

export default function LoansPage() {
  const [user, setUser] = useState<SangaUser | null>(null)
  const [applications, setApplications] = useState<LoanApplication[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const storedUser = localStorage.getItem('sanga_user')
    if (!storedUser) {
      router.push('/login')
      return
    }
    try {
      const parsed = JSON.parse(storedUser) as Partial<SangaUser>
      if (!parsed.isAuthenticated || typeof parsed.phone !== 'string') {
        router.push('/login')
        return
      }
      const u: SangaUser = {
        phone: parsed.phone,
        isAuthenticated: true,
        loginTime:
          typeof parsed.loginTime === 'number' ? parsed.loginTime : 0,
      }
      setUser(u)

      fetch(`/api/loans?phone=${encodeURIComponent(u.phone)}`)
        .then((r) => r.json())
        .then((data: { applications?: LoanApplication[] }) => {
          setApplications(data.applications ?? [])
        })
        .catch(() => setApplications([]))
        .finally(() => setLoading(false))
    } catch {
      router.push('/login')
    }
  }, [router])

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">My Loans</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading…</div>
        ) : applications.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-6 w-6 text-gray-400" />
            </div>
            <p className="font-semibold text-gray-900">No loans yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Apply for a loan and track its status here.
            </p>
            <button
              onClick={() => router.push('/loans/apply')}
              className="mt-5 bg-[#1A2A4F] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#243B66] transition-colors"
            >
              Apply for a loan
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((loan) => (
              <div
                key={loan.id}
                className="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      KES {loan.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {loan.purpose} · {loan.duration} days
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusStyles[loan.status]}`}
                  >
                    {loan.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Ref {loan.id} · {new Date(loan.appliedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {applications.length > 0 && (
        <button
          onClick={() => router.push('/loans/apply')}
          className="fixed bottom-6 right-6 bg-[#1A2A4F] text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:bg-[#243B66] transition-colors"
          aria-label="Apply for a loan"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
