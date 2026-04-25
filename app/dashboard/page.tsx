'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import { SkeletonDashboard } from '@/components/ui/SkeletonLoader'
import { SavingsReleaseCard } from '@/components/GenZ/SavingsReleaseCard'
import { InstantLoanCard } from '@/components/GenZ/InstantLoanCard'
import { PersonalizedFeed } from '@/components/GenZ/PersonalizedFeed'
import { ExperienceToggle } from '@/components/ExperienceToggle'
import { ChatWidget } from '@/components/chat/ChatWidget'
import { ThreeDCard } from '@/components/ui/Card3D'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  FileText,
  Clock,
  Bell,
  User,
  Eye,
  EyeOff,
  Sparkles,
  Gem,
} from 'lucide-react'

type SangaUser = {
  phone: string
  isAuthenticated: boolean
  loginTime: number
  full_name?: string
}

type MemberData = {
  totalBalance: number
  savings: number
  shares: number
  loanBalance: number
  creditScore: number
  recentTransactions: Array<{
    id: string | number
    type: 'deposit' | 'withdrawal' | 'loan_repayment' | string
    amount: number
    created_at?: string
    description: string
    date?: string
    time?: string
  }>
}

export default function DashboardPage() {
  const [user, setUser] = useState<SangaUser | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [memberData, setMemberData] = useState<MemberData>({
    totalBalance: 0,
    savings: 0,
    shares: 0,
    loanBalance: 0,
    creditScore: 0,
    recentTransactions: [],
  })

  const [savingsAccountId, setSavingsAccountId] = useState<string | null>(null)

  const loadDashboardData = async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      router.push('/login')
      return
    }

    const profile = await supabase
      .from('users')
      .select('full_name, phone')
      .eq('id', authUser.id)
      .maybeSingle()

    const fullName =
      (authUser.user_metadata as any)?.full_name ||
      profile.data?.full_name ||
      ''
    const phone = (authUser.user_metadata as any)?.phone || profile.data?.phone || ''

    localStorage.setItem(
      'sanga_user',
      JSON.stringify({
        phone,
        isAuthenticated: true,
        loginTime: Date.now(),
        full_name: fullName,
      })
    )

    setUser({
      phone,
      isAuthenticated: true,
      loginTime: Date.now(),
      full_name: fullName,
    })

    const membership = await supabase
      .from('sacco_memberships')
      .select('id, sacco_id')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (!membership.data) {
      setLoading(false)
      return
    }

    const accounts = await supabase
      .from('member_accounts')
      .select('id, balance, account_type')
      .eq('sacco_membership_id', membership.data.id)

    const savingsAccount = accounts.data?.find((a) => a.account_type === 'savings')
    const sharesAccount = accounts.data?.find((a) => a.account_type === 'shares')
    const loanAccount = accounts.data?.find((a) => a.account_type === 'loan')

    if (savingsAccount?.id) setSavingsAccountId(savingsAccount.id)

    const savings = Number(savingsAccount?.balance ?? 0)
    const shares = Number(sharesAccount?.balance ?? 0)
    const loanBalance = Number(loanAccount?.balance ?? 0)

    const creditScoreRow = await supabase
      .from('credit_scores')
      .select('score')
      .eq('user_id', authUser.id)
      .order('last_calculated', { ascending: false })
      .limit(1)
      .maybeSingle()

    const creditScore = Number(creditScoreRow.data?.score ?? 0)

    const tx = savingsAccount?.id
      ? await supabase
          .from('transactions')
          .select('id,type,amount,description,created_at')
          .eq('member_account_id', savingsAccount.id)
          .order('created_at', { ascending: false })
          .limit(5)
      : null

    const recentTransactions =
      tx?.data?.map((t: any) => {
        const d = t.created_at ? new Date(t.created_at) : null
        return {
          id: t.id,
          type: t.type,
          amount: Number(t.amount ?? 0),
          created_at: t.created_at,
          description: t.description || 'Transaction',
          date: d ? d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) : '',
          time: d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '',
        }
      }) || []

    setMemberData({
      totalBalance: savings + shares,
      savings,
      shares,
      loanBalance,
      creditScore,
      recentTransactions,
    })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Honour saved experience mode. Read fast-path from localStorage
        // first to avoid a flash of the digital UI before the API
        // responds. The toggle keeps localStorage in sync.
        try {
          const cached = localStorage.getItem('sanga_experience_mode')
          if (cached === 'simplified') {
            router.replace('/dashboard/simplified')
            return
          }
        } catch {}

        try {
          const res = await fetch('/api/me/preferences', { cache: 'no-store' })
          if (res.ok) {
            const json = await res.json()
            if (!cancelled && json?.experience_mode === 'simplified') {
              router.replace('/dashboard/simplified')
              return
            }
          }
        } catch {
          // non-fatal
        }

        if (cancelled) return
        await loadDashboardData()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (!savingsAccountId) return

    const channel = supabase
      .channel('balance-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'member_accounts' },
        (payload: any) => {
          if (payload?.new?.id === savingsAccountId) {
            const newBalance = Number(payload.new.balance ?? 0)
            setMemberData((prev) => ({
              ...prev,
              savings: newBalance,
              totalBalance: newBalance + prev.shares,
            }))
            toast.info('Balance updated')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [savingsAccountId])

  useEffect(() => {
    let startY = 0
    let pulled = false

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return
      startY = e.touches[0]?.clientY ?? 0
      pulled = false
    }
    const onTouchMove = (e: TouchEvent) => {
      if (window.scrollY > 0) return
      const y = e.touches[0]?.clientY ?? 0
      if (y - startY > 90) pulled = true
    }
    const onTouchEnd = async () => {
      if (!pulled) return
      setRefreshing(true)
      try {
        await loadDashboardData()
        toast.success('Updated')
      } catch {
        toast.error('Refresh failed')
      } finally {
        setRefreshing(false)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }

  const quickActions = [
    {
      title: 'Deposit',
      icon: ArrowDownLeft,
      href: '/deposit',
      color: 'from-green-500 to-emerald-600',
      glow: 'shadow-green-500/20',
    },
    {
      title: 'Withdraw',
      icon: ArrowUpRight,
      href: '/withdraw',
      color: 'from-red-500 to-rose-600',
      glow: 'shadow-red-500/20',
    },
    {
      title: 'Transfer',
      icon: Send,
      href: '/transfer',
      color: 'from-blue-500 to-indigo-600',
      glow: 'shadow-blue-500/20',
    },
    {
      title: 'Apply Loan',
      icon: FileText,
      href: '/loans/apply',
      color: 'from-purple-500 to-violet-600',
      glow: 'shadow-purple-500/20',
    },
  ]

  if (loading) {
    return <SkeletonDashboard />
  }

  const creditBand =
    memberData.creditScore >= 750
      ? { label: 'Excellent', pct: 95 }
      : memberData.creditScore >= 650
        ? { label: 'Good', pct: 75 }
        : memberData.creditScore >= 500
          ? { label: 'Fair', pct: 55 }
          : memberData.creditScore > 0
            ? { label: 'Building', pct: 30 }
            : { label: 'Not scored yet', pct: 0 }

  const savingsPct =
    memberData.totalBalance > 0
      ? Math.min(100, Math.round((memberData.savings / memberData.totalBalance) * 100))
      : 0
  const sharesPct =
    memberData.totalBalance > 0
      ? Math.min(100, Math.round((memberData.shares / memberData.totalBalance) * 100))
      : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pb-20">
      {/* Ambient background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-secondary/5 rounded-full blur-3xl animate-float" />
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '2s' }}
        />
      </div>

      {refreshing && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-30 bg-white shadow-sm border border-gray-200 text-xs px-3 py-1 rounded-full">
          Refreshing…
        </div>
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary via-primary-dark to-primary-light text-white">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-10">
            <div className="flex justify-between items-start">
              <div>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center gap-2 mb-2"
                >
                  <Gem className="h-5 w-5 text-secondary animate-glow" />
                  <span className="text-xs font-semibold tracking-[0.2em] text-secondary">
                    SANGA MEMBER
                  </span>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.05 }}
                  className="text-white/70 text-sm"
                >
                  Good {getGreeting()}
                </motion.p>
                <motion.h1
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="text-2xl sm:text-3xl font-bold font-serif mt-1"
                >
                  {user?.full_name?.split(' ')[0] || 'Member'}
                </motion.h1>
              </div>
              <div className="flex gap-2 items-center">
                <ExperienceToggle />
                <button
                  onClick={() => router.push('/notifications')}
                  className="relative p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                </button>
                <button
                  onClick={() => router.push('/profile')}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
                  aria-label="Profile"
                >
                  <User className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="max-w-2xl mx-auto px-4 sm:px-6 -mt-6"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/20 to-secondary/5 rounded-2xl blur-xl" />
            <ThreeDCard glare scale={1.02} rotationFactor={10} perspective={1200} radius={16}>
            <div className="relative bg-gradient-to-br from-primary via-primary-dark to-primary-light rounded-2xl shadow-2xl overflow-hidden text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />
              <div className="relative p-6 sm:p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-white/60 text-xs tracking-wider">TOTAL BALANCE</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-3xl sm:text-4xl font-bold font-serif">
                        {showBalance
                          ? `KES ${memberData.totalBalance.toLocaleString()}`
                          : '••••••'}
                      </p>
                      <button
                        onClick={() => setShowBalance(!showBalance)}
                        className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition"
                        aria-label={showBalance ? 'Hide balance' : 'Show balance'}
                      >
                        {showBalance ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/15">
                  <div>
                    <p className="text-white/60 text-[10px] tracking-wider">SAVINGS</p>
                    <p className="text-sm sm:text-base font-semibold mt-1">
                      {showBalance
                        ? `KES ${memberData.savings.toLocaleString()}`
                        : '••••'}
                    </p>
                    <div className="w-full bg-white/15 rounded-full h-1 mt-2">
                      <div
                        className="bg-secondary rounded-full h-1 transition-all"
                        style={{ width: `${savingsPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-white/60 text-[10px] tracking-wider">SHARES</p>
                    <p className="text-sm sm:text-base font-semibold mt-1">
                      {showBalance
                        ? `KES ${memberData.shares.toLocaleString()}`
                        : '••••'}
                    </p>
                    <div className="w-full bg-white/15 rounded-full h-1 mt-2">
                      <div
                        className="bg-secondary rounded-full h-1 transition-all"
                        style={{ width: `${sharesPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-white/60 text-[10px] tracking-wider">LOAN</p>
                    <p
                      className={`text-sm sm:text-base font-semibold mt-1 ${
                        memberData.loanBalance > 0 ? 'text-red-300' : ''
                      }`}
                    >
                      {showBalance
                        ? `KES ${memberData.loanBalance.toLocaleString()}`
                        : '••••'}
                    </p>
                    <div className="w-full bg-white/15 rounded-full h-1 mt-2">
                      <div
                        className="bg-red-400 rounded-full h-1"
                        style={{
                          width: `${
                            memberData.loanBalance > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (memberData.loanBalance /
                                      Math.max(
                                        memberData.loanBalance + memberData.totalBalance,
                                        1
                                      )) *
                                      100
                                  )
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </ThreeDCard>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="max-w-2xl mx-auto px-4 sm:px-6 mt-8"
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-secondary" />
            What would you like to do?
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickActions.map((action, index) => (
              <motion.button
                key={action.title}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: 0.3 + index * 0.05 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push(action.href)}
                className={`relative group overflow-hidden rounded-xl p-4 text-left transition-all duration-300 hover:shadow-xl ${action.glow}`}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-90 group-hover:opacity-100 transition-opacity`}
                />
                <div className="relative z-10">
                  <action.icon className="h-6 w-6 text-white mb-2" />
                  <p className="text-white font-semibold text-sm">{action.title}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Instant loan + partial release (conditional) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="max-w-2xl mx-auto px-4 sm:px-6 mt-6 space-y-4"
        >
          <InstantLoanCard />
          {memberData.loanBalance > 0 && <SavingsReleaseCard />}
        </motion.div>

        {/* Accounts + Insights */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-6 grid sm:grid-cols-2 gap-4">
          {/* My Accounts */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="card-luxury p-5"
          >
            <h3 className="font-semibold text-gray-900 mb-3">My Accounts</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-700">Savings</p>
                  <p className="text-xs text-gray-400">SANGA Savings</p>
                </div>
                <p className="font-semibold text-gray-900">
                  KES {memberData.savings.toLocaleString()}
                </p>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-700">Share Capital</p>
                  <p className="text-xs text-gray-400">SANGA Shares</p>
                </div>
                <p className="font-semibold text-gray-900">
                  KES {memberData.shares.toLocaleString()}
                </p>
              </div>
              {memberData.loanBalance > 0 && (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-700">Outstanding Loan</p>
                    <p className="text-xs text-gray-400">Current balance</p>
                  </div>
                  <p className="font-semibold text-red-600">
                    KES {memberData.loanBalance.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Credit Score */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="card-luxury p-5"
          >
            <h3 className="font-semibold text-gray-900 mb-3">SANGA Score</h3>
            {memberData.creditScore > 0 ? (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-primary">
                    {memberData.creditScore}
                  </p>
                  <span className="text-sm text-secondary font-medium">
                    {creditBand.label}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                  <div
                    className="bg-gradient-to-r from-secondary to-secondary-light rounded-full h-2 transition-all"
                    style={{ width: `${creditBand.pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Keep saving consistently to improve your score.
                </p>
              </>
            ) : (
              <div className="text-sm text-gray-500">
                <p>Your credit score will appear here once you've had activity in your account.</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="max-w-2xl mx-auto px-4 sm:px-6 mt-6"
        >
          <div className="card-luxury overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Recent Activity</h3>
              <button
                onClick={() => router.push('/transactions')}
                className="text-xs text-secondary hover:text-secondary-dark transition-colors font-medium"
              >
                See all →
              </button>
            </div>
            {memberData.recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent transactions</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {memberData.recentTransactions.map((tx, i) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    className="p-4 flex justify-between items-center hover:bg-gray-50/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          tx.type === 'deposit'
                            ? 'bg-green-100'
                            : tx.type === 'withdrawal'
                              ? 'bg-red-100'
                              : 'bg-blue-100'
                        }`}
                      >
                        {tx.type === 'deposit' && (
                          <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        )}
                        {tx.type === 'withdrawal' && (
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                        {tx.type !== 'deposit' && tx.type !== 'withdrawal' && (
                          <Wallet className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {tx.description}
                        </p>
                        <p className="text-xs text-gray-400">
                          {tx.date}
                          {tx.time ? `, ${tx.time}` : ''}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`font-semibold text-sm ${
                        tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {tx.type === 'deposit' ? '+' : '-'} KES{' '}
                      {tx.amount.toLocaleString()}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Personalized — live recommendations from real member state */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="max-w-2xl mx-auto px-4 sm:px-6 mt-6 pb-8"
        >
          <PersonalizedFeed />
        </motion.div>
      </div>

      {/* Floating deposit button */}
      <button
        onClick={() => router.push('/deposit')}
        className="fixed bottom-20 right-4 bg-gradient-to-br from-secondary to-secondary-dark w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-30 hover:scale-105 transition-transform animate-glow"
        aria-label="Quick deposit"
      >
        <ArrowDownLeft className="h-6 w-6 text-primary" />
      </button>

      <ChatWidget />

      <BottomNav />
    </div>
  )
}
