'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Eye, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function MembersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [members] = useState([
    { id: 1, name: 'John Mwangi', phone: '254722210711', memberNo: 'SANGA001', status: 'verified', joined: '2024-01-15' },
    { id: 2, name: 'Sarah Omondi', phone: '254722210712', memberNo: 'SANGA002', status: 'pending', joined: '2024-02-20' },
    { id: 3, name: 'Peter Kamau', phone: '254722210713', memberNo: 'SANGA003', status: 'verified', joined: '2024-03-10' },
  ])

  const filtered = members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.memberNo.includes(search))

  const verifyMember = (id: number) => { toast.success('Member verified'); router.refresh() }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6"><h1 className="text-2xl font-bold">Members</h1><p className="text-white/70 text-sm mt-1">Manage SACCO members</p></div>
      <div className="p-4">
        <div className="flex gap-2 mb-4"><div className="flex-1 relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search by name or member number" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg" /></div>
          <button className="bg-[#D4AF37] text-[#1A2A4F] px-4 py-2 rounded-lg flex items-center gap-2"><Plus className="h-4 w-4" /> Add</button></div>
        <div className="bg-white rounded-xl overflow-hidden">
          <table className="w-full"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs">Member No</th><th className="px-4 py-3 text-left text-xs">Name</th><th className="px-4 py-3 text-left text-xs">Phone</th><th className="px-4 py-3 text-left text-xs">Status</th><th className="px-4 py-3 text-left text-xs"></th></tr></thead>
            <tbody className="divide-y">{filtered.map(m => (<tr key={m.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-sm font-mono">{m.memberNo}</td>
              <td className="px-4 py-3 text-sm font-medium">{m.name}</td><td className="px-4 py-3 text-sm">{m.phone}</td>
              <td className="px-4 py-3">{m.status === 'verified' ? <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full">Verified</span> :
                <button onClick={() => verifyMember(m.id)} className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">Verify</button>}</td>
              <td className="px-4 py-3"><button className="p-1 hover:bg-gray-100 rounded"><Eye className="h-4 w-4 text-gray-500" /></button></td></tr>))}</tbody></table>
        </div>
      </div>
    </div>
  )
}
