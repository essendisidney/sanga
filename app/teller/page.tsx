'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock, CheckCircle, XCircle,
  ArrowDownLeft, ArrowUpRight, Printer,
  User, Search, DollarSign
} from 'lucide-react'
import { toast } from 'sonner'

export default function TellerDashboard() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [member, setMember] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionType, setTransactionType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [loading, setLoading] = useState(false)

  // Mock session data
  useEffect(() => {
    setSession({
      isOpen: true,
      openedAt: new Date().toISOString(),
      openingBalance: 50000,
      currentBalance: 73450,
      cashIn: 28450,
      cashOut: 5000,
      teller: 'John Mwangi'
    })
  }, [])

  const searchMember = async () => {
    if (!searchTerm) return
    // Mock search
    setMember({
      id: '1',
      name: 'Sidney Essendi',
      phone: '254722210711',
      memberNo: 'SANGA001',
      balance: 45250
    })
  }

  const processTransaction = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter valid amount')
      return
    }

    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))

    toast.success(`${transactionType} of KES ${amount} successful`)
    setAmount('')
    setMember(null)
    setSearchTerm('')
    setLoading(false)
  }

  if (!session?.isOpen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Active Session</h2>
          <p className="text-gray-500 mb-6">Open a teller session to start</p>
          <button className="bg-[#1A2A4F] text-white px-6 py-3 rounded-lg">
            Open Session
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A2A4F] text-white p-6">
        <h1 className="text-2xl font-bold">Teller Console</h1>
        <p className="text-white/70 text-sm mt-1">Cash handling & member services</p>
      </div>

      <div className="p-4 max-w-md mx-auto">
        {/* Session Info */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-green-800">Session Open</p>
              <p className="text-2xl font-bold text-green-900">KES {session.currentBalance.toLocaleString()}</p>
              <p className="text-xs text-green-700">Teller: {session.teller}</p>
            </div>
            <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
              Close Session
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-green-200">
            <div><p className="text-xs text-green-700">Cash In</p><p className="font-semibold">KES {session.cashIn.toLocaleString()}</p></div>
            <div><p className="text-xs text-green-700">Cash Out</p><p className="font-semibold">KES {session.cashOut.toLocaleString()}</p></div>
          </div>
        </div>

        {/* Member Search */}
        {!member ? (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">Find Member</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Member No or Phone"
                className="flex-1 p-3 border rounded-lg"
              />
              <button onClick={searchMember} className="bg-[#1A2A4F] text-white px-4 rounded-lg">
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Member Info */}
            <div className="bg-white rounded-xl p-6 mb-4">
              <div className="flex justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{member.name}</h3>
                    <p className="text-xs text-gray-500">{member.memberNo}</p>
                    <p className="text-xs text-gray-400">{member.phone}</p>
                  </div>
                </div>
                <button onClick={() => setMember(null)} className="text-gray-400 text-sm">Change</button>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Account Balance</p>
                <p className="text-2xl font-bold">KES {member.balance.toLocaleString()}</p>
              </div>
            </div>

            {/* Transaction Form */}
            <div className="bg-white rounded-xl p-6">
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setTransactionType('deposit')}
                  className={`flex-1 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    transactionType === 'deposit' ? 'bg-green-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  <ArrowDownLeft className="h-4 w-4" /> Deposit
                </button>
                <button
                  onClick={() => setTransactionType('withdrawal')}
                  className={`flex-1 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    transactionType === 'withdrawal' ? 'bg-red-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4" /> Withdraw
                </button>
              </div>

              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full p-3 border rounded-lg mb-4 text-lg"
              />

              <div className="grid grid-cols-4 gap-2 mb-6">
                {[1000, 2000, 5000, 10000].map(a => (
                  <button key={a} onClick={() => setAmount(a.toString())}
                    className="py-2 border rounded-lg text-sm">KES {a}</button>
                ))}
              </div>

              <button
                onClick={processTransaction}
                disabled={loading}
                className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold disabled:opacity-50"
              >
                {loading ? 'Processing...' : `Process ${transactionType}`}
              </button>

              <div className="mt-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <Printer className="h-3 w-3" /> Receipt will print automatically
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
