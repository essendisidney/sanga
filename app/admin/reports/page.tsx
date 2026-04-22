'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, FileText, TrendingUp } from 'lucide-react'

const reports = [
  {
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity snapshot',
    href: '/admin/reports/balance-sheet',
    icon: BarChart3,
    available: true,
  },
  {
    title: 'Income Statement',
    description: 'Revenue and expenses over time',
    href: '/admin/reports/income-statement',
    icon: TrendingUp,
    available: false,
  },
  {
    title: 'Loan Portfolio',
    description: 'Active, pending, defaulted loans',
    href: '/admin/reports/loan-portfolio',
    icon: FileText,
    available: false,
  },
]

export default function ReportsIndexPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button
          onClick={() => router.push('/admin')}
          className="text-white/70 mb-2 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-white/70 text-sm mt-1">Financial reports and analytics</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="grid md:grid-cols-2 gap-4">
          {reports.map((r) => {
            const Icon = r.icon
            return (
              <button
                key={r.href}
                onClick={() => r.available && router.push(r.href)}
                disabled={!r.available}
                className="bg-white rounded-xl p-5 shadow-sm text-left hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between">
                  <Icon className="h-6 w-6 text-[#D4AF37] mb-3" />
                  {!r.available && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      Coming soon
                    </span>
                  )}
                </div>
                <h2 className="font-semibold text-gray-900">{r.title}</h2>
                <p className="text-sm text-gray-500 mt-1">{r.description}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
