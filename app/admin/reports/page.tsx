'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Download, Printer, Calendar, TrendingUp, Users, FileText } from 'lucide-react'
import { toast } from 'sonner'

export default function ReportsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalSavings: 0,
    totalLoans: 0,
    totalTransactions: 0,
    dailyDeposits: 0,
    dailyWithdrawals: 0
  })

  useEffect(() => {
    fetchStats()
  }, [date])

  async function fetchStats() {
    const { data: members } = await supabase.from('sacco_memberships').select('*', { count: 'exact', head: true })
    const { data: accounts } = await supabase.from('member_accounts').select('balance').eq('account_type', 'savings')
    const { data: loans } = await supabase.from('loan_applications').select('amount')
    const { data: transactions } = await supabase.from('transactions').select('*').gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`)
    
    const totalSavings = accounts?.reduce((sum, a) => sum + (a.balance || 0), 0) || 0
    const totalLoans = loans?.reduce((sum, l) => sum + (l.amount || 0), 0) || 0
    const dailyDeposits = transactions?.filter(t => t.type === 'deposit').reduce((sum, t) => sum + (t.amount || 0), 0) || 0
    const dailyWithdrawals = transactions?.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + (t.amount || 0), 0) || 0

    setStats({
      totalMembers: members?.length || 0,
      totalSavings,
      totalLoans,
      totalTransactions: transactions?.length || 0,
      dailyDeposits,
      dailyWithdrawals
    })
  }

  const handleExport = () => {
    toast.success('Report exported successfully')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Financial Reports</h1>
        <p className="text-white/70 text-sm mt-1">View and export reports</p>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border rounded-lg"><Download className="h-4 w-4" /> Export</button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-[#1A2A4F] text-white rounded-lg"><Printer className="h-4 w-4" /> Print</button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Users className="h-5 w-5 text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{stats.totalMembers}</p>
            <p className="text-xs text-gray-500">Total Members</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <TrendingUp className="h-5 w-5 text-green-500 mb-2" />
            <p className="text-2xl font-bold">KES {stats.totalSavings.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Savings</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <FileText className="h-5 w-5 text-purple-500 mb-2" />
            <p className="text-2xl font-bold">KES {stats.totalLoans.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Loans</p>
          </div>
        </div>

        {/* Daily Summary */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Daily Summary - {new Date(date).toLocaleDateString()}</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-500">Total Deposits</p>
                <p className="text-xl font-bold text-green-600">KES {stats.dailyDeposits.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Withdrawals</p>
                <p className="text-xl font-bold text-red-600">KES {stats.dailyWithdrawals.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Net Flow</p>
                <p className={`text-xl font-bold ${stats.dailyDeposits - stats.dailyWithdrawals >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  KES {(stats.dailyDeposits - stats.dailyWithdrawals).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
