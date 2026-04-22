'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, CheckCircle, XCircle, Clock,
  Eye, TrendingUp, Users, Calendar
} from 'lucide-react'
import { toast } from 'sonner'

export default function LoanOfficerDashboard() {
  const router = useRouter()
  const [applications, setApplications] = useState([
    { id: 1, name: 'John Mwangi', amount: 50000, purpose: 'Business', date: '2024-05-01', status: 'pending' },
    { id: 2, name: 'Sarah Omondi', amount: 100000, purpose: 'Education', date: '2024-04-30', status: 'pending' },
    { id: 3, name: 'Peter Kamau', amount: 25000, purpose: 'Emergency', date: '2024-04-29', status: 'pending' },
    { id: 4, name: 'Mary Wanjiku', amount: 150000, purpose: 'Development', date: '2024-04-28', status: 'approved' },
    { id: 5, name: 'James Otieno', amount: 30000, purpose: 'Medical', date: '2024-04-27', status: 'rejected' },
  ])

  const stats = {
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
    totalAmount: applications.reduce((sum, a) => sum + a.amount, 0)
  }

  const handleApprove = (id: number) => {
    toast.success('Loan approved successfully')
    setApplications(apps => apps.map(a => a.id === id ? { ...a, status: 'approved' } : a))
  }

  const handleReject = (id: number) => {
    toast.error('Loan rejected')
    setApplications(apps => apps.map(a => a.id === id ? { ...a, status: 'rejected' } : a))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <h1 className="text-2xl font-bold">Loan Officer Dashboard</h1>
        <p className="text-white/70 text-sm mt-1">Review and process loan applications</p>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><Clock className="h-5 w-5 text-yellow-500" /></div>
            <p className="text-2xl font-bold">{stats.pending}</p><p className="text-xs text-gray-500">Pending</p></div>
          <div className="bg-white rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><CheckCircle className="h-5 w-5 text-green-500" /></div>
            <p className="text-2xl font-bold">{stats.approved}</p><p className="text-xs text-gray-500">Approved</p></div>
          <div className="bg-white rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><XCircle className="h-5 w-5 text-red-500" /></div>
            <p className="text-2xl font-bold">{stats.rejected}</p><p className="text-xs text-gray-500">Rejected</p></div>
          <div className="bg-white rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
            <p className="text-2xl font-bold">KES {stats.totalAmount.toLocaleString()}</p><p className="text-xs text-gray-500">Total Value</p></div>
        </div>

        {/* Applications Table */}
        <div className="bg-white rounded-xl overflow-hidden">
          <div className="p-4 border-b"><h2 className="font-semibold">Loan Applications</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr><th className="px-4 py-3 text-left text-xs">Member</th><th className="px-4 py-3 text-left text-xs">Amount</th>
                <th className="px-4 py-3 text-left text-xs">Purpose</th><th className="px-4 py-3 text-left text-xs">Date</th>
                <th className="px-4 py-3 text-left text-xs">Status</th><th className="px-4 py-3 text-left text-xs">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {applications.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{app.name}</td>
                    <td className="px-4 py-3">KES {app.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{app.purpose}</td>
                    <td className="px-4 py-3">{app.date}</td>
                    <td className="px-4 py-3">
                      {app.status === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Pending</span>}
                      {app.status === 'approved' && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Approved</span>}
                      {app.status === 'rejected' && <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Rejected</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => router.push(`/staff/loan-officer/applications/${app.id}`)} className="p-1 hover:bg-gray-100 rounded">
                          <Eye className="h-4 w-4 text-gray-500" />
                        </button>
                        {app.status === 'pending' && (
                          <>
                            <button onClick={() => handleApprove(app.id)} className="p-1 hover:bg-green-100 rounded">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </button>
                            <button onClick={() => handleReject(app.id)} className="p-1 hover:bg-red-100 rounded">
                              <XCircle className="h-4 w-4 text-red-600" />
                            </button>
                          </>
                        )}
                      </div>
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
