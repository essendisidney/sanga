'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, FileText, Coins, BarChart3, LogOut, TrendingUp, Clock } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalSavings: 0,
    pendingLoans: 0,
    approvedLoans: 0,
    rejectedLoans: 0,
    totalLoans: 0,
    totalLoanAmount: 0,
    recentTransactions: []
  })

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    localStorage.removeItem('sanga_user')
    toast.success('Logged out')
    router.push('/login')
  }

  const modules = [
    { title: 'Member Management', icon: Users, href: '/admin/members', color: 'bg-blue-500', desc: 'Add, verify, and manage members' },
    { title: 'Loan Management', icon: FileText, href: '/admin/loans', color: 'bg-purple-500', desc: 'Review and approve loans' },
    { title: 'Teller Console', icon: Coins, href: '/staff/teller', color: 'bg-green-500', desc: 'Cash deposits & withdrawals' },
    { title: 'Financial Reports', icon: BarChart3, href: '/admin/reports', color: 'bg-orange-500', desc: 'View financial reports' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🔐 Admin Dashboard</h1>
            <p className="text-white/70 text-sm mt-1">Manage your SACCO</p>
          </div>
          <button onClick={handleLogout} className="bg-white/10 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Users className="h-5 w-5 text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{stats.totalMembers.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Members</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <TrendingUp className="h-5 w-5 text-green-500 mb-2" />
            <p className="text-2xl font-bold">KES {stats.totalSavings.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Savings</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <FileText className="h-5 w-5 text-purple-500 mb-2" />
            <p className="text-2xl font-bold">{stats.totalLoans}</p>
            <p className="text-xs text-gray-500">Total Loans</p>
            <p className="text-xs text-gray-400">KES {stats.totalLoanAmount.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Clock className="h-5 w-5 text-orange-500 mb-2" />
            <p className="text-2xl font-bold">{stats.pendingLoans}</p>
            <p className="text-xs text-gray-500">Pending Approvals</p>
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {modules.map((module) => (
            <button
              key={module.title}
              onClick={() => router.push(module.href)}
              className="bg-white rounded-xl p-6 text-left hover:shadow-md transition-all border border-gray-100"
            >
              <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center mb-3`}>
                <module.icon className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{module.title}</h2>
              <p className="text-sm text-gray-500">{module.desc}</p>
            </button>
          ))}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Transactions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Member</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.recentTransactions.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No transactions yet</td></tr>
                ) : (
                  stats.recentTransactions.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{tx.users?.full_name || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm capitalize">{tx.type}</td>
                      <td className="px-4 py-3 text-sm font-medium">KES {tx.amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          tx.status === 'completed' ? 'bg-green-100 text-green-800' :
                          tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <button 
          onClick={() => router.push('/dashboard')}
          className="mt-6 w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold"
        >
          ← Back to Member App
        </button>
      </div>
    </div>
  )
}
