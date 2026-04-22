'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function ApplyLoanPage() {
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [duration, setDuration] = useState('30')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || Number(amount) < 1000) return toast.error('Minimum loan is KES 1,000')
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    toast.success('Application submitted! Pending approval')
    setTimeout(() => router.push('/loans'), 2000)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Apply for Loan</h1>
      </div>
      <div className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Amount (KES)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border rounded-lg" required /></div>
          <div><label className="block text-sm font-medium mb-1">Purpose</label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}
              className="w-full p-3 border rounded-lg" required>
              <option value="">Select</option><option value="business">Business</option>
              <option value="education">Education</option><option value="medical">Medical</option>
              <option value="emergency">Emergency</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Duration</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value)}
              className="w-full p-3 border rounded-lg">
              <option value="30">30 days</option><option value="60">60 days</option>
              <option value="90">90 days</option><option value="180">180 days</option>
            </select></div>
          <button type="submit" disabled={loading}
            className="w-full bg-[#1A2A4F] text-white py-3 rounded-lg font-semibold disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}
