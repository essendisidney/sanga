'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

type SangaUser = { phone: string; isAuthenticated: boolean; loginTime: number }

export default function ApplyLoanPage() {
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [duration, setDuration] = useState('30')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!amount || Number(amount) < 1000) return toast.error('Minimum loan is KES 1,000')
    if (!purpose) return toast.error('Select a purpose')

    setLoading(true)
    try {
      const res = await fetch('/api/loans/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user.phone, amount: Number(amount), purpose, duration: Number(duration) })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Application submitted!')
        // Keep button disabled through redirect so a double-tap can't resubmit.
        setTimeout(() => router.push('/loans'), 1500)
      } else {
        toast.error(data.error || 'Submission failed')
        setLoading(false)
      }
    } catch {
      toast.error('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Apply for Loan</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount (KES)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border rounded-lg" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Purpose</label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}
              className="w-full p-3 border rounded-lg" required>
              <option value="">Select purpose</option>
              <option value="business">Business</option>
              <option value="education">Education</option>
              <option value="medical">Medical</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Duration (days)</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value)}
              className="w-full p-3 border rounded-lg">
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
            </select>
          </div>

          <button type="submit" disabled={loading || !user}
            className="w-full bg-[#1A2A4F] text-white py-3 rounded-lg font-semibold disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}
