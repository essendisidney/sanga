'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Percent, Shield, Bell } from 'lucide-react'

const sections = [
  {
    title: 'SACCO Profile',
    description: 'Name, registration number, branding',
    icon: Building2,
  },
  {
    title: 'Interest Rates',
    description: 'Default rates for savings, shares, loans',
    icon: Percent,
  },
  {
    title: 'Roles & Permissions',
    description: 'Who can do what across admin/staff tools',
    icon: Shield,
  },
  {
    title: 'Notifications',
    description: 'SMS and email templates',
    icon: Bell,
  },
]

export default function AdminSettingsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button
          onClick={() => router.push('/admin')}
          className="text-white/70 mb-2 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-white/70 text-sm mt-1">System configuration</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-3">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.title}
              className="bg-white rounded-xl p-4 shadow-sm flex items-start justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <Icon className="h-5 w-5 text-gray-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{s.title}</p>
                  <p className="text-sm text-gray-500">{s.description}</p>
                </div>
              </div>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full self-center">
                Coming soon
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
