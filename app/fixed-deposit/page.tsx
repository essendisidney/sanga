'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, Calendar, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

export default function FixedDepositPage() {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [term, setTerm] = useState('90')
  const [loading, setLoading] = useState(false)

  const terms = [
    { days: 30, rate: 8, label: '1 Month' },
    { days: 90, rate: 10, label: '3 Months' },
    { days: 180, rate: 12, label: '6 Months' },
    { days: 365, rate: 14, label: '1 Year' },
  ]

  const selectedTerm = terms.find(t => t.days === Number(term))
  const interest = Number(amount) * (selectedTerm?.rate || 0) / 100 * (Number(term) / 365)
  const maturity = Number(amount) + interest

  async function createDeposit() {
    if (!amount || Number(amount) < 1000) {
      toast.error('Minimum deposit is KES 1,000')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/fixed-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          interest_rate: selectedTerm?.rate,
          term_days: Number(term)
        })
      })

      if (res.ok) {
        toast.success(`Fixed deposit of KES ${amount} created!`)
        router.push('/dashboard')
      } else {
        toast.error('Failed to create deposit')
      }
    } catch (error) {
      toast.error('Failed to create deposit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Fixed Deposit</h1>
      </div>

      <div className="p-4 max-w-md mx-auto">
        <div className="bg-gradient-to-r from-[#1A2A4F] to-[#243B66] rounded-xl p-6 text-white mb-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5" />
            <span className="font-semibold">Earn up to 14% per annum</span>
          </div>
          <p className="text-sm opacity-80">Lock your savings for higher returns</p>
        </div>

        <div className="bg-white rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Deposit Amount (KES)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Minimum KES 1,000"
              className="w-full p-3 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Term Period</label>
            <div className="grid grid-cols-4 gap-2">
              {terms.map(t => (
                <button
                  key={t.days}
                  onClick={() => setTerm(t.days.toString())}
                  className={`py-2 rounded-lg text-sm ${term === t.days.toString() ? 'bg-[#D4AF37] text-[#1A2A4F]' : 'bg-gray-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {amount && Number(amount) >= 1000 && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span>Principal</span>
                <span className="font-semibold">KES {Number(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Interest ({selectedTerm?.rate}% p.a.)</span>
                <span className="font-semibold text-green-600">+ KES {interest.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-bold">Maturity Amount</span>
                <span className="font-bold text-[#D4AF37]">KES {maturity.toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Matures in {term} days
              </div>
            </div>
          )}

          <button
            onClick={createDeposit}
            disabled={loading || !amount || Number(amount) < 1000}
            className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Create Fixed Deposit'}
          </button>
        </div>
      </div>
    </div>
  )
}
