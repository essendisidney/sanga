'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, Percent, DollarSign, Calendar, Shield, Bell } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({
    savingsInterestRate: 8,
    loanInterestRate: 12,
    minSavingsBalance: 1000,
    minShares: 5000,
    withdrawalLimit: 100000,
    loanApprovalLimit: 100000
  })

  const handleSave = async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    toast.success('Settings saved successfully')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-white/70 text-sm mt-1">Configure SACCO parameters</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 space-y-6">
            {/* Interest Rates */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Percent className="h-5 w-5 text-[#D4AF37]" /> Interest Rates</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Savings Interest Rate (%)</label>
                  <input type="number" value={settings.savingsInterestRate} onChange={(e) => setSettings({...settings, savingsInterestRate: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Loan Interest Rate (%)</label>
                  <input type="number" value={settings.loanInterestRate} onChange={(e) => setSettings({...settings, loanInterestRate: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
              </div>
            </div>

            {/* Limits */}
            <div className="border-t pt-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><DollarSign className="h-5 w-5 text-[#D4AF37]" /> Limits & Requirements</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Minimum Savings Balance (KES)</label>
                  <input type="number" value={settings.minSavingsBalance} onChange={(e) => setSettings({...settings, minSavingsBalance: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Minimum Share Capital (KES)</label>
                  <input type="number" value={settings.minShares} onChange={(e) => setSettings({...settings, minShares: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Daily Withdrawal Limit (KES)</label>
                  <input type="number" value={settings.withdrawalLimit} onChange={(e) => setSettings({...settings, withdrawalLimit: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Loan Officer Approval Limit (KES)</label>
                  <input type="number" value={settings.loanApprovalLimit} onChange={(e) => setSettings({...settings, loanApprovalLimit: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
                </div>
              </div>
            </div>

            <button onClick={handleSave} disabled={loading} className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
              <Save className="h-4 w-4" /> {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
