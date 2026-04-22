'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, FileText, TrendingUp, Clock, LogOut, Settings, UserCheck, Coins } from 'lucide-react'

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalSavings: 0,
    pendingLoans: 0,
    totalLoans: 0
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    setUser(user)

    // Check role
    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    // Load stats
    const { data: members } = await supabase
      .from('sacco_memberships')
      .select('*', { count: 'exact', head: true })

    const { data: accounts } = await supabase
      .from('member_accounts')
      .select('balance')
      .eq('account_type', 'savings')

    const totalSavings = accounts?.reduce((sum, a) => sum + (a.balance || 0), 0) || 0

    const { data: loans } = await supabase
      .from('loan_applications')
      .select('status')

    const pendingLoans = loans?.filter(l => l.status === 'pending').length || 0

    setStats({
      totalMembers: members?.length || 0,
      totalSavings,
      pendingLoans,
      totalLoans: loans?.length || 0
    })
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A2A4F] text-white p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-white/70 text-sm mt-1">
              Welcome, {user?.user_metadata?.full_name || 'Admin'}
            </p>
          </div>
          <button onClick={handleLogout} className="bg-white/10 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
            <p className="text-2xl font-bold">{stats.totalLoans}</p>
            <p className="text-xs text-gray-500">Total Loans</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Clock className="h-5 w-5 text-orange-500 mb-2" />
            <p className="text-2xl font-bold">{stats.pendingLoans}</p>
            <p className="text-xs text-gray-500">Pending Approvals</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid md:grid-cols-3 gap-4">
          <button 
            onClick={() => router.push('/admin/members')}
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all text-left border border-gray-100"
          >
            <UserCheck className="h-8 w-8 text-blue-500 mb-3" />
            <h2 className="text-lg font-semibold mb-1">Member Management</h2>
            <p className="text-sm text-gray-500">Add, verify, and manage members</p>
          </button>

          <button 
            onClick={() => router.push('/admin/loans')}
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all text-left border border-gray-100"
          >
            <FileText className="h-8 w-8 text-purple-500 mb-3" />
            <h2 className="text-lg font-semibold mb-1">Loan Management</h2>
            <p className="text-sm text-gray-500">Review and approve loan applications</p>
          </button>

          <button 
            onClick={() => router.push('/staff/teller')}
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all text-left border border-gray-100"
          >
            <Coins className="h-8 w-8 text-green-500 mb-3" />
            <h2 className="text-lg font-semibold mb-1">Teller Console</h2>
            <p className="text-sm text-gray-500">Process cash deposits and withdrawals</p>
          </button>
        </div>
      </div>
    </div>
  )
}
