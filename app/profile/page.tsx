'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, User, Bell, Lock, Shield, LogOut, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import BottomNav from '@/components/BottomNav'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const router = useRouter()
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    localStorage.removeItem('sanga_user')
    toast.success('Logged out')
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4"><button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button><h1 className="text-xl font-bold">Profile</h1></div>
      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-xl p-6 text-center mb-6"><div className="w-20 h-20 bg-[#1A2A4F] rounded-full mx-auto mb-3 flex items-center justify-center"><User className="h-10 w-10 text-white" /></div>
          <h2 className="text-xl font-bold">John Member</h2><p className="text-sm text-gray-500">Member since Jan 2024</p><p className="text-xs text-gray-400 mt-1">Member No: SANGA-001234</p></div>
        <div className="bg-white rounded-xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b"><div className="flex items-center gap-3"><User className="h-5 w-5 text-gray-400" /><span>Personal Info</span></div><ChevronRight className="h-4 w-4" /></button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b"><div className="flex items-center gap-3"><Bell className="h-5 w-5 text-gray-400" /><span>Notifications</span></div><ChevronRight className="h-4 w-4" /></button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b"><div className="flex items-center gap-3"><Lock className="h-5 w-5 text-gray-400" /><span>Security</span></div><ChevronRight className="h-4 w-4" /></button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b"><div className="flex items-center gap-3"><Shield className="h-5 w-5 text-gray-400" /><span>Privacy Policy</span></div><ChevronRight className="h-4 w-4" /></button>
          <button onClick={handleLogout} className="w-full flex items-center justify-between p-4 hover:bg-red-50 text-red-600"><div className="flex items-center gap-3"><LogOut className="h-5 w-5" /><span>Logout</span></div></button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">SANGA™ v1.0.0 | Connecting Africa's Wealth™</p>
      </div>
      <BottomNav />
    </div>
  )
}
