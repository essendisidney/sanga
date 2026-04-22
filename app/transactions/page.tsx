'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Send } from 'lucide-react'

export default function TransactionsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<any[]>([])

  useEffect(() => {
    setTransactions([
      { id: 1, type: 'deposit', amount: 35000, date: 'Today', desc: 'Salary Deposit' },
      { id: 2, type: 'withdrawal', amount: 2500, date: 'Yesterday', desc: 'M-Pesa Withdrawal' },
      { id: 3, type: 'transfer', amount: 5000, date: '02 May', desc: 'To John Mwangi' },
      { id: 4, type: 'deposit', amount: 10000, date: '01 May', desc: 'Mobile Deposit' },
    ])
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Transactions</h1>
      </div>
      <div className="max-w-md mx-auto px-4 py-4">
        {transactions.map(tx => (
          <div key={tx.id} className="bg-white rounded-xl p-4 mb-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${tx.type === 'deposit' ? 'bg-green-100' : tx.type === 'withdrawal' ? 'bg-red-100' : 'bg-blue-100'}`}>
                {tx.type === 'deposit' && <ArrowDownLeft className="h-4 w-4 text-green-600" />}
                {tx.type === 'withdrawal' && <ArrowUpRight className="h-4 w-4 text-red-600" />}
                {tx.type === 'transfer' && <Send className="h-4 w-4 text-blue-600" />}
              </div>
              <div><p className="font-medium">{tx.desc}</p><p className="text-xs text-gray-400">{tx.date}</p></div>
            </div>
            <p className={`font-semibold ${tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
              {tx.type === 'deposit' ? '+' : '-'} KES {tx.amount.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
