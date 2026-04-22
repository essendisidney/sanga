'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, UserPlus, Eye, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Member {
  id: string
  member_number: string
  role: string
  is_verified: boolean
  joined_at: string
  users: {
    id: string
    full_name: string
    phone: string
    email: string
    national_id: string
    status: string
  }
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    try {
      const res = await fetch('/api/admin/members')
      const data = await res.json()
      setMembers(data)
    } catch (error) {
      console.error('Failed to fetch members:', error)
      toast.error('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  async function verifyMember(membershipId: string) {
    try {
      const res = await fetch('/api/admin/members/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId })
      })
      if (res.ok) {
        toast.success('Member verified')
        fetchMembers()
      } else {
        toast.error('Failed to verify member')
      }
    } catch (error) {
      toast.error('Failed to verify member')
    }
  }

  const filteredMembers = members.filter(m => 
    m.users?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.member_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.users?.phone?.includes(searchTerm)
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Member Management</h1>
        <p className="text-white/70 text-sm mt-1">Manage SACCO members</p>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        <div className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, member number, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg"
            />
          </div>
          <button className="bg-[#D4AF37] text-[#1A2A4F] px-4 py-2 rounded-lg flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Member
          </button>
          <button onClick={fetchMembers} className="bg-gray-100 px-4 py-2 rounded-lg">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Member No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : filteredMembers.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No members found</td></tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">{member.member_number}</td>
                      <td className="px-4 py-3 text-sm font-medium">{member.users?.full_name}</td>
                      <td className="px-4 py-3 text-sm">{member.users?.phone}</td>
                      <td className="px-4 py-3 text-sm">{new Date(member.joined_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {member.is_verified ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1 w-fit">
                            <CheckCircle className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <button 
                            onClick={() => verifyMember(member.id)}
                            className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full flex items-center gap-1"
                          >
                            Pending Verification
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button className="p-1 hover:bg-gray-100 rounded">
                          <Eye className="h-4 w-4 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
