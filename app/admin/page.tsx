'use client'

import { useRouter } from 'next/navigation'
import { Users, FileText, Coins, BarChart3, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Logged out')
    router.push('/login')
  }

  const modules = [
    { title: 'Member Management', icon: Users, href: '/admin/members', color: 'bg-blue-500', desc: 'Add, verify, and manage members' },
    { title: 'Loan Management', icon: FileText, href: '/admin/loans', color: 'bg-purple-500', desc: 'Review and approve loans' },
    { title: 'Teller Console', icon: Coins, href: '/staff/teller', color: 'bg-green-500', desc: 'Cash deposits & withdrawals' },
    { title: 'Reports', icon: BarChart3, href: '/admin/reports', color: 'bg-orange-500', desc: 'Financial reports & analytics' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🔐 Admin Dashboard</h1>
            <p className="text-white/70 text-sm mt-1">Manage your SACCO</p>
          </div>
          <button onClick={handleLogout} className="bg-white/10 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-4">
          {modules.map((module) => (
            <button
              key={module.title}
              onClick={() => router.push(module.href)}
              className="bg-white rounded-xl p-6 text-left hover:shadow-md transition-all border border-gray-100"
            >
              <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center mb-3`}>
                <module.icon className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{module.title}</h2>
              <p className="text-sm text-gray-500">{module.desc}</p>
            </button>
          ))}
        </div>

        <button 
          onClick={() => router.push('/dashboard')}
          className="mt-6 w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold"
        >
          ← Back to Member App
        </button>
      </div>
    </div>
  )
}
