'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Search, User, DollarSign, Printer } from 'lucide-react'
import { toast } from 'sonner'

export default function TellerPage() {
  const [member, setMember] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionType, setTransactionType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const searchMember = async () => {
    if (!searchTerm) return

    const { data } = await supabase
      .from('sacco_memberships')
      .select('*, users(*)')
      .or(`member_number.eq.${searchTerm},users.phone.eq.${searchTerm}`)
      .limit(1)

    if (data && data[0]) {
      const { data: accounts } = await supabase
        .from('member_accounts')
        .select('*')
        .eq('sacco_membership_id', data[0].id)
        .eq('account_type', 'savings')
        .single()

      setMember({
        ...data[0].users,
        member_number: data[0].member_number,
        balance: accounts?.balance || 0,
        accountId: accounts?.id,
        membershipId: data[0].id
      })
    } else {
      toast.error('Member not found')
    }
  }

  const processTransaction = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter valid amount')
      return
    }

    if (transactionType === 'withdrawal' && Number(amount) > member.balance) {
      toast.error('Insufficient balance')
      return
    }

    setLoading(true)

    const newBalance = transactionType === 'deposit' 
      ? member.balance + Number(amount)
      : member.balance - Number(amount)

    await supabase
      .from('member_accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', member.accountId)

    await supabase
      .from('transactions')
      .insert({
        user_id: member.id,
        member_account_id: member.accountId,
        type: transactionType,
        amount: Number(amount),
        balance_before: member.balance,
        balance_after: newBalance,
        status: 'completed',
        description: `${transactionType === 'deposit' ? 'Cash deposit' : 'Cash withdrawal'} at teller`,
        completed_at: new Date().toISOString()
      })

    toast.success(`${transactionType} of KES ${amount} successful`)
    setMember(null)
    setSearchTerm('')
    setAmount('')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Teller Console</h1>
        <p className="text-white/70 text-sm mt-1">Cash deposits & withdrawals</p>
      </div>

      <div className="p-4 max-w-md mx-auto">
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
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{member.full_name}</h3>
                    <p className="text-xs text-gray-500">{member.member_number}</p>
                    <p className="text-xs text-gray-400">{member.phone}</p>
                  </div>
                </div>
                <button onClick={() => setMember(null)} className="text-gray-400 text-sm">Change</button>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Account Balance</p>
                <p className="text-2xl font-bold">KES {member.balance?.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6">
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setTransactionType('deposit')}
                  className={`flex-1 py-3 rounded-lg font-semibold ${
                    transactionType === 'deposit' ? 'bg-green-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setTransactionType('withdrawal')}
                  className={`flex-1 py-3 rounded-lg font-semibold ${
                    transactionType === 'withdrawal' ? 'bg-red-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  Withdraw
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
                  <button key={a} onClick={() => setAmount(a.toString())} className="py-2 border rounded-lg text-sm">
                    KES {a}
                  </button>
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
          </div>
        )}
      </div>
    </div>
  )
}
