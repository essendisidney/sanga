'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle, XCircle, Eye, Clock, TrendingUp, FileText } from 'lucide-react'
import { toast } from 'sonner'

export default function LoansPage() {
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchLoans()
  }, [filter])

  async function fetchLoans() {
    let query = supabase
      .from('loan_applications')
      .select('*, users(*)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    setLoans(data || [])
    setLoading(false)
  }

  const updateStatus = async (id: string, status: string) => {
    await supabase
      .from('loan_applications')
      .update({ 
        status, 
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        rejected_at: status === 'rejected' ? new Date().toISOString() : null
      })
      .eq('id', id)
    
    toast.success(`Loan ${status}`)
    fetchLoans()
  }

  const stats = {
    total: loans.length,
    pending: loans.filter(l => l.status === 'pending').length,
    approved: loans.filter(l => l.status === 'approved').length,
    rejected: loans.filter(l => l.status === 'rejected').length,
    totalAmount: loans.reduce((sum, l) => sum + (l.amount || 0), 0)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Loan Management</h1>
        <p className="text-white/70 text-sm mt-1">Review and approve loan applications</p>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <FileText className="h-5 w-5 text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">Total Applications</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <Clock className="h-5 w-5 text-yellow-500 mb-2" />
            <p className="text-2xl font-bold">{stats.pending}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <CheckCircle className="h-5 w-5 text-green-500 mb-2" />
            <p className="text-2xl font-bold">{stats.approved}</p>
            <p className="text-xs text-gray-500">Approved</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <TrendingUp className="h-5 w-5 text-purple-500 mb-2" />
            <p className="text-2xl font-bold">KES {stats.totalAmount.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Value</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 border-b">
          {['all', 'pending', 'approved', 'rejected', 'disbursed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                filter === tab ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]' : 'text-gray-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Loans Table */}
        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Member</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Purpose</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center">Loading...</td></tr>
                ) : loans.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No loan applications</td></tr>
                ) : (
                  loans.map((loan) => (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{loan.users?.full_name}</td>
                      <td className="px-4 py-3 text-sm font-medium">KES {loan.amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm capitalize">{loan.purpose || 'General'}</td>
                      <td className="px-4 py-3 text-sm">{new Date(loan.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {loan.status === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Pending</span>}
                        {loan.status === 'approved' && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Approved</span>}
                        {loan.status === 'rejected' && <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Rejected</span>}
                        {loan.status === 'disbursed' && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Disbursed</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button className="p-1 hover:bg-gray-100 rounded"><Eye className="h-4 w-4 text-gray-500" /></button>
                          {loan.status === 'pending' && (
                            <>
                              <button onClick={() => updateStatus(loan.id, 'approved')} className="p-1 hover:bg-green-100 rounded">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </button>
                              <button onClick={() => updateStatus(loan.id, 'rejected')} className="p-1 hover:bg-red-100 rounded">
                                <XCircle className="h-4 w-4 text-red-600" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
