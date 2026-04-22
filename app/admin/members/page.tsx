'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Search,
  UserPlus,
  Eye,
  RefreshCw,
  CheckCircle,
  Upload,
  X,
} from 'lucide-react'
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [viewMember, setViewMember] = useState<Member | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [newMember, setNewMember] = useState({
    full_name: '',
    phone: '',
    national_id: '',
    email: '',
    role: 'member',
  })
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
        body: JSON.stringify({ membershipId }),
      })
      if (res.ok) {
        toast.success('Member verified')
        fetchMembers()
      } else {
        toast.error('Failed to verify member')
      }
    } catch {
      toast.error('Failed to verify member')
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!newMember.full_name || !newMember.phone || !newMember.national_id) {
      toast.error('Name, phone, and national ID are required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to create member')
      toast.success('Member added')
      setShowAddModal(false)
      setNewMember({ full_name: '', phone: '', national_id: '', email: '', role: 'member' })
      fetchMembers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredMembers = members.filter(
    (m) =>
      m.users?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.member_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.users?.phone?.includes(searchTerm),
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
        <div className="flex gap-2 mb-6 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, member number, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#D4AF37] text-[#1A2A4F] px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" /> Add Member
          </button>
          <button
            onClick={() => router.push('/admin/members/import')}
            className="bg-[#1A2A4F] text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> Bulk Import
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
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No members found
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">{member.member_number || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium">{member.users?.full_name}</td>
                      <td className="px-4 py-3 text-sm">{member.users?.phone}</td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(member.joined_at).toLocaleDateString()}
                      </td>
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
                        <button
                          onClick={() => setViewMember(member)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="View details"
                        >
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

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddMember}
            className="bg-white rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Add Member</h2>
              <button type="button" onClick={() => setShowAddModal(false)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Full name *</label>
              <input
                value={newMember.full_name}
                onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone (254…) *</label>
              <input
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="254712345678"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">National ID *</label>
              <input
                value={newMember.national_id}
                onChange={(e) => setNewMember({ ...newMember, national_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="member">Member</option>
                <option value="teller">Teller</option>
                <option value="loan_officer">Loan Officer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#D4AF37] text-[#1A2A4F] py-2.5 rounded-lg font-semibold disabled:opacity-60"
            >
              {submitting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
        </div>
      )}

      {viewMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Member Details</h2>
              <button onClick={() => setViewMember(null)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">Member No</dt>
                <dd className="font-mono">{viewMember.member_number || '—'}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">Name</dt>
                <dd>{viewMember.users?.full_name}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">Phone</dt>
                <dd>{viewMember.users?.phone}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">Email</dt>
                <dd>{viewMember.users?.email || '—'}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">National ID</dt>
                <dd>{viewMember.users?.national_id || '—'}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">Role</dt>
                <dd>{viewMember.role}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="text-gray-500">Verified</dt>
                <dd>{viewMember.is_verified ? 'Yes' : 'No'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Joined</dt>
                <dd>{new Date(viewMember.joined_at).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}
