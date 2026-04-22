'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, FileText, TrendingUp, Clock } from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalSavings: 0,
    totalLoans: 0,
    pendingLoans: 0,
    approvedLoans: 0,
    rejectedLoans: 0,
    totalDisbursed: 0,
  })
  const [recentApplications, setRecentApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadAdminData()
  }, [])

  async function loadAdminData() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Get SACCO
    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('sacco_id')
      .eq('user_id', user.id)
      .single()

    if (membership) {
      // Total members
      const { count: members } = await supabase
        .from('sacco_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('sacco_id', membership.sacco_id)

      // Total savings
      const { data: accounts } = await supabase
        .from('member_accounts')
        .select('balance')
        .eq('account_type', 'savings')

      const totalSavings =
        accounts?.reduce((sum, a) => sum + (a.balance || 0), 0) || 0

      // Loan stats
      const { data: loans } = await supabase
        .from('loan_applications')
        .select('*')
        .eq('sacco_id', membership.sacco_id)

      const pendingLoans = loans?.filter((l) => l.status === 'pending').length || 0
      const approvedLoans = loans?.filter((l) => l.status === 'approved').length || 0
      const rejectedLoans = loans?.filter((l) => l.status === 'rejected').length || 0
      const totalDisbursed =
        loans
          ?.filter((l) => l.status === 'disbursed')
          .reduce((sum, l) => sum + l.amount, 0) || 0

      // Recent applications
      const { data: recent } = await supabase
        .from('loan_applications')
        .select('*, users(full_name, phone)')
        .eq('sacco_id', membership.sacco_id)
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentApplications(recent || [])
      setStats({
        totalMembers: members || 0,
        totalSavings,
        totalLoans: loans?.length || 0,
        pendingLoans,
        approvedLoans,
        rejectedLoans,
        totalDisbursed,
      })
    }
    setLoading(false)
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
      <div className="bg-[#1A2A4F] text-white p-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-white/70 text-sm mt-1">Manage your SACCO</p>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Users className="h-5 w-5 text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{stats.totalMembers}</p>
            <p className="text-xs text-gray-500">Total Members</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <TrendingUp className="h-5 w-5 text-green-500 mb-2" />
            <p className="text-2xl font-bold">
              KES {stats.totalSavings.toLocaleString()}
            </p>
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
            <p className="text-xs text-gray-500">Pending Approval</p>
          </div>
        </div>

        {/* Loan Applications Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              Recent Loan Applications
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Member
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Purpose
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {app.users?.full_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      KES {app.amount?.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm capitalize">
                      {app.purpose}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(app.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {app.status === 'pending' && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                          Pending
                        </span>
                      )}
                      {app.status === 'approved' && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          Approved
                        </span>
                      )}
                      {app.status === 'rejected' && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                          Rejected
                        </span>
                      )}
                      {app.status === 'disbursed' && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          Disbursed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/admin/loans/${app.id}`)}
                        className="text-xs text-[#D4AF37] hover:underline"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
