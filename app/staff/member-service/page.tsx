'use client'

import { useState } from 'react'
import { Search, User, Phone, Mail, Calendar, Edit, Save, Lock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export default function MemberService() {
  const [searchTerm, setSearchTerm] = useState('')
  const [member, setMember] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState<any>({})

  const searchMember = () => {
    // Mock search
    setMember({
      id: 1,
      name: 'Sidney Essendi',
      email: 'sidney@sanga.africa',
      phone: '254722210711',
      memberNo: 'SANGA001',
      joinDate: '2024-01-15',
      status: 'active',
      balance: 45250,
      loanBalance: 0,
      creditScore: 750
    })
    setFormData(member)
  }

  const handleUpdate = () => {
    toast.success('Member information updated')
    setEditing(false)
  }

  const handleResetPin = () => {
    toast.success('PIN reset notification sent to member')
  }

  const handleSuspend = () => {
    toast.warning('Member account suspended')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <h1 className="text-2xl font-bold">Member Service Console</h1>
        <p className="text-white/70 text-sm mt-1">Manage member accounts and support</p>
      </div>

      <div className="p-4 max-w-4xl mx-auto">
        {/* Search */}
        <div className="bg-white rounded-xl p-6 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, member number, or phone"
              className="flex-1 p-3 border rounded-lg"
            />
            <button onClick={searchMember} className="bg-[#1A2A4F] text-white px-6 rounded-lg flex items-center gap-2">
              <Search className="h-4 w-4" /> Search
            </button>
          </div>
        </div>

        {member && (
          <div className="bg-white rounded-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1A2A4F] to-[#243B66] p-6 text-white">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{member.name}</h2>
                    <p className="text-white/80 text-sm">Member No: {member.memberNo}</p>
                    <p className="text-white/60 text-xs">Joined: {member.joinDate}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs ${member.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}>
                  {member.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <User className="h-5 w-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Full Name</p>
                      {editing ? (
                        <input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full p-1 border rounded" />
                      ) : <p className="font-medium">{member.name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Phone</p>
                      {editing ? <input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full p-1 border rounded" />
                      : <p className="font-medium">{member.phone}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Email</p>
                      {editing ? <input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-1 border rounded" />
                      : <p className="font-medium">{member.email || 'Not provided'}</p>}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Account Balance</p>
                    <p className="text-2xl font-bold text-green-600">KES {member.balance.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Loan Balance</p>
                    <p className="text-2xl font-bold text-red-600">KES {member.loanBalance.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Credit Score</p>
                    <p className="text-2xl font-bold text-[#D4AF37]">{member.creditScore}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-4 border-t">
                {editing ? (
                  <button onClick={handleUpdate} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                    <Save className="h-4 w-4" /> Save Changes
                  </button>
                ) : (
                  <button onClick={() => setEditing(true)} className="bg-[#1A2A4F] text-white px-4 py-2 rounded-lg flex items-center gap-2">
                    <Edit className="h-4 w-4" /> Edit Profile
                  </button>
                )}
                <button onClick={handleResetPin} className="border border-[#D4AF37] text-[#D4AF37] px-4 py-2 rounded-lg flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Reset PIN
                </button>
                <button onClick={handleSuspend} className="border border-red-500 text-red-500 px-4 py-2 rounded-lg flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" /> Suspend Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
