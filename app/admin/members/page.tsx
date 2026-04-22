'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Search, UserPlus, CheckCircle, XCircle, Eye } from 'lucide-react'
import { toast } from 'sonner'

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    const { data } = await supabase
      .from('sacco_memberships')
      .select('*, users(*)')
      .order('joined_at', { ascending: false })

    setMembers(data || [])
    setLoading(false)
  }

  const filteredMembers = members.filter(m => 
    m.users?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.member_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.users?.phone?.includes(searchTerm)
  )

  const verifyMember = async (membershipId: string) => {
    await supabase
      .from('sacco_memberships')
      .update({ is_verified: true, verified_at: new Date().toISOString() })
      .eq('id', membershipId)
    
    toast.success('Member verified')
    fetchMembers()
  }

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
        {/* Search */}
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
        </div>

        {/* Members Table */}
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
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Verified</span>
                        ) : (
                          <button 
                            onClick={() => verifyMember(member.id)}
                            className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full"
                          >
                            Pending
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
