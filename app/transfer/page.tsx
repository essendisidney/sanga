'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search } from 'lucide-react'
import { toast } from 'sonner'

export default function TransferPage() {
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleTransfer = async () => {
    if (!recipient || !amount || Number(amount) < 10) return toast.error('Enter valid details')
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    toast.success(`KES ${amount} sent to ${recipient}`)
    setTimeout(() => router.push('/dashboard'), 2000)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Send Money</h1>
      </div>
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-xl p-6 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Recipient</label>
            <div className="flex gap-2"><input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
              placeholder="Phone number or member ID" className="flex-1 p-3 border rounded-lg" />
              <button className="bg-gray-100 px-4 rounded-lg"><Search className="h-5 w-5" /></button></div></div>
          <div><label className="block text-sm font-medium mb-1">Amount (KES)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" className="w-full p-3 border rounded-lg" /></div>
          <button onClick={handleTransfer} disabled={loading}
            className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold disabled:opacity-50">
            {loading ? 'Sending...' : 'Send Money'}
          </button>
        </div>
      </div>
    </div>
  )
}
