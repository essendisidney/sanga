'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock, CheckCircle, XCircle } from 'lucide-react'

export default function LoansPage() {
  const router = useRouter()
  const [loans, setLoans] = useState<any[]>([])

  useEffect(() => {
    setLoans([
      { id: 1, amount: 50000, status: 'pending', date: '2024-05-01', purpose: 'Business' },
      { id: 2, amount: 100000, status: 'approved', date: '2024-04-15', purpose: 'Education' },
      { id: 3, amount: 25000, status: 'rejected', date: '2024-04-01', purpose: 'Emergency' },
    ])
  }, [])

  const getStatusBadge = (status: string) => {
    if (status === 'pending') return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs"><Clock className="h-3 w-3" /> Pending</span>
    if (status === 'approved') return <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs"><CheckCircle className="h-3 w-3" /> Approved</span>
    return <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs"><XCircle className="h-3 w-3" /> Rejected</span>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">My Loans</h1>
      </div>
      <div className="max-w-md mx-auto px-4 py-4">
        {loans.length === 0 ? (
          <div className="text-center py-12"><p className="text-gray-500">No loan applications yet</p>
            <button onClick={() => router.push('/loans/apply')} className="mt-4 bg-[#1A2A4F] text-white px-6 py-2 rounded-lg text-sm">Apply Now</button>
          </div>
        ) : (
          loans.map(loan => (
            <div key={loan.id} className="bg-white rounded-xl p-4 mb-3">
              <div className="flex justify-between items-start mb-2">
                <div><p className="font-bold text-lg">KES {loan.amount.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 capitalize">{loan.purpose}</p></div>
                {getStatusBadge(loan.status)}
              </div>
              <p className="text-xs text-gray-400">Applied: {new Date(loan.date).toLocaleDateString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
