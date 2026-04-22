'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

type SangaUser = { phone: string; isAuthenticated: boolean; loginTime: number }

export default function WithdrawPage() {
  const [amount, setAmount] = useState('')
  const [balance] = useState(45250)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<SangaUser | null>(null)
  const router = useRouter()

  useEffect(() => {
    const raw = localStorage.getItem('sanga_user')
    if (!raw) return router.push('/login')
    try {
      const p = JSON.parse(raw) as Partial<SangaUser>
      if (!p.isAuthenticated || typeof p.phone !== 'string') return router.push('/login')
      setUser({ phone: p.phone, isAuthenticated: true, loginTime: p.loginTime ?? 0 })
    } catch {
      router.push('/login')
    }
  }, [router])

  const handleWithdraw = async () => {
    if (!user) return
    const amt = Number(amount)
    if (!amt || amt < 10) return toast.error('Enter valid amount')
    if (amt > balance) return toast.error('Insufficient balance')

    setLoading(true)
    try {
      const res = await fetch('/api/mpesa/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user.phone, amount: amt })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`KES ${amt.toLocaleString()} withdrawal initiated`)
        setTimeout(() => router.push('/dashboard'), 2000)
      } else {
        toast.error(data.error || 'Withdrawal failed')
        setLoading(false)
      }
    } catch {
      toast.error('Network error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Withdraw to M-Pesa</h1>
      </div>
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-xl p-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg mb-6">
            <p className="text-sm text-gray-500">Available Balance</p>
            <p className="text-2xl font-bold">KES {balance.toLocaleString()}</p>
          </div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount" className="w-full p-3 border rounded-lg mb-6 text-lg" />
          <button onClick={handleWithdraw} disabled={loading || !amount || !user}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50">
            {loading ? 'Processing...' : 'Withdraw to M-Pesa'}
          </button>
        </div>
      </div>
    </div>
  )
}
