'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Phone } from 'lucide-react'
import { toast } from 'sonner'

type SangaUser = { phone: string; isAuthenticated: boolean; loginTime: number }

export default function DepositPage() {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<SangaUser | null>(null)
  const router = useRouter()

  const presetAmounts = [500, 1000, 2000, 5000, 10000, 20000]
  const paybill = 'SANGA001'

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

  const handleDeposit = async () => {
    if (!user) return
    if (!amount || Number(amount) < 10) return toast.error('Enter valid amount (min KES 10)')

    setLoading(true)
    try {
      const res = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user.phone, amount: Number(amount) })
      })
      const data = await res.json()
      if (data.success) {
        toast.success('STK Push sent! Check your phone')
        setTimeout(() => router.push('/dashboard'), 3000)
      } else {
        toast.error(data.error || 'Payment failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold text-gray-900">Deposit via M-Pesa</h1>
      </div>
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Phone className="h-8 w-8" />
            <div><p className="text-sm opacity-90">Paybill</p><p className="text-2xl font-bold">{paybill}</p></div>
          </div>
          <div className="border-t border-green-400 pt-3">
            <p className="text-sm opacity-90">Account</p>
            <p className="text-lg font-mono">{user?.phone ?? 'Loading…'}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (KES)" className="w-full p-3 border rounded-lg mb-4 text-lg" autoFocus />
          <div className="grid grid-cols-3 gap-2 mb-6">
            {presetAmounts.map(a => (
              <button key={a} onClick={() => setAmount(a.toString())}
                className="py-2 border rounded-lg text-sm hover:bg-gray-50">KES {a.toLocaleString()}</button>
            ))}
          </div>
          <button onClick={handleDeposit} disabled={loading || !amount || !user}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50">
            {loading ? 'Processing...' : 'Deposit via M-Pesa'}
          </button>
        </div>
      </div>
    </div>
  )
}
