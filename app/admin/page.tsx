'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users,
  FileText,
  Coins,
  BarChart3,
  Clock,
  TrendingUp,
  Wallet,
  CheckCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

type Stats = {
  totalMembers: number
  totalSavings: number
  pendingLoans: number
  approvedLoans: number
  rejectedLoans: number
  totalLoans: number
  totalLoanAmount: number
  recentTransactions: any[]
}

const defaultStats: Stats = {
  totalMembers: 0,
  totalSavings: 0,
  pendingLoans: 0,
  approvedLoans: 0,
  rejectedLoans: 0,
  totalLoans: 0,
  totalLoanAmount: 0,
  recentTransactions: [],
}

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>(defaultStats)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          router.replace('/login')
          return
        }
        if (res.status === 403) {
          toast.error('Admin access required')
          router.replace('/dashboard')
          return
        }
        throw new Error(data?.error || `Request failed (${res.status})`)
      }
      setStats({
        totalMembers: Number(data?.totalMembers) || 0,
        totalSavings: Number(data?.totalSavings) || 0,
        pendingLoans: Number(data?.pendingLoans) || 0,
        approvedLoans: Number(data?.approvedLoans) || 0,
        rejectedLoans: Number(data?.rejectedLoans) || 0,
        totalLoans: Number(data?.totalLoans) || 0,
        totalLoanAmount: Number(data?.totalLoanAmount) || 0,
        recentTransactions: Array.isArray(data?.recentTransactions)
          ? data.recentTransactions
          : [],
      })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      label: 'Total Members',
      value: stats.totalMembers.toLocaleString(),
      icon: Users,
      accent: 'from-blue-500 to-indigo-600',
    },
    {
      label: 'Total Savings',
      value: `KES ${stats.totalSavings.toLocaleString()}`,
      icon: TrendingUp,
      accent: 'from-emerald-500 to-green-600',
    },
    {
      label: 'Total Loans',
      value: stats.totalLoans.toLocaleString(),
      sub: `KES ${stats.totalLoanAmount.toLocaleString()}`,
      icon: FileText,
      accent: 'from-purple-500 to-violet-600',
    },
    {
      label: 'Pending Approvals',
      value: stats.pendingLoans.toLocaleString(),
      icon: Clock,
      accent: 'from-amber-500 to-orange-600',
    },
  ]

  const modules = [
    {
      title: 'Member Management',
      desc: 'Add, verify, and manage members',
      icon: Users,
      href: '/admin/members',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'Loan Management',
      desc: 'Review and approve loans',
      icon: FileText,
      href: '/admin/loans',
      color: 'from-purple-500 to-violet-600',
    },
    {
      title: 'Teller Console',
      desc: 'Cash deposits & withdrawals',
      icon: Coins,
      href: '/staff/teller',
      color: 'from-amber-500 to-orange-600',
    },
    {
      title: 'Financial Reports',
      desc: 'View financial reports',
      icon: BarChart3,
      href: '/admin/reports',
      color: 'from-cyan-500 to-teal-600',
    },
  ]

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Heading */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-2xl sm:text-3xl font-bold font-serif text-primary"
        >
          Admin Dashboard
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="text-sm text-gray-500 mt-1"
        >
          Overview of your SACCO
        </motion.p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * i }}
            className="card-luxury p-5 relative overflow-hidden"
          >
            <div
              className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${card.accent} opacity-10 rounded-full blur-2xl`}
            />
            <div className="relative">
              <div
                className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${card.accent}`}
              >
                <card.icon className="h-4 w-4 text-white" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-3">
                {card.value}
              </p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              {card.sub && (
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modules */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((m, i) => (
            <motion.button
              key={m.title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: 0.2 + i * 0.05 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push(m.href)}
              className="card-luxury p-5 text-left"
            >
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-3 shadow-md`}
              >
                <m.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900">{m.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{m.desc}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="card-luxury overflow-hidden"
      >
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Latest activity across your SACCO
            </p>
          </div>
          <Wallet className="h-5 w-5 text-secondary" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">
                  Member
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.recentTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-gray-500"
                  >
                    No transactions yet
                  </td>
                </tr>
              ) : (
                stats.recentTransactions.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {tx.users?.full_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-700">
                      {tx.type}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      KES {Number(tx.amount ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {tx.created_at
                        ? new Date(tx.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          tx.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : tx.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {tx.status === 'completed' && (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
