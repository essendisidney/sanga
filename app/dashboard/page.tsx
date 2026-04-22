'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import {
  Home,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  FileText,
  Clock,
  Bell,
  User,
  TrendingUp,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react'

type SangaUser = {
  phone: string
  isAuthenticated: boolean
  loginTime: number
  full_name?: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<SangaUser | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Member data
  const [memberData, setMemberData] = useState({
    totalBalance: 0,
    savings: 0,
    shares: 0,
    loanBalance: 0,
    creditScore: 0,
    nextPayment: { amount: 0, date: '' },
    recentTransactions: [] as Array<{
      id: string | number
      type: 'deposit' | 'withdrawal' | 'loan_repayment' | string
      amount: number
      created_at?: string
      description: string
      date?: string
      time?: string
    }>,
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

    // keep legacy localStorage shape for other pages
    localStorage.setItem(
      'sanga_user',
      JSON.stringify({
        phone: (authUser.user_metadata as any)?.phone || '',
        isAuthenticated: true,
        loginTime: Date.now(),
        full_name: (authUser.user_metadata as any)?.full_name,
      })
    )

    setUser({
      phone: (authUser.user_metadata as any)?.phone || '',
      isAuthenticated: true,
      loginTime: Date.now(),
      full_name: (authUser.user_metadata as any)?.full_name,
    })

    // Find savings account for this user via membership
    const membership = await supabase
      .from('sacco_memberships')
      .select('id, sacco_id')
      .eq('user_id', authUser.id)
      .single()

    const account = membership.data
      ? await supabase
          .from('member_accounts')
          .select('id, balance, account_type')
          .eq('sacco_membership_id', membership.data.id)
          .eq('account_type', 'savings')
          .single()
      : null

    if (account?.data?.id) {
      setSavingsAccountId(account.data.id)
    }

    const savings = Number(account?.data?.balance ?? 0)

    // Recent transactions for this savings account (if table exists & RLS allows)
    const tx = account?.data?.id
      ? await supabase
          .from('transactions')
          .select('id,type,amount,description,created_at')
          .eq('member_account_id', account.data.id)
          .order('created_at', { ascending: false })
          .limit(3)
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

    setMemberData((prev) => ({
      ...prev,
      savings,
      totalBalance: savings, // until shares/loan are wired
      shares: prev.shares,
      loanBalance: prev.loanBalance,
      creditScore: prev.creditScore || 750,
      nextPayment: prev.nextPayment?.date ? prev.nextPayment : { amount: 12500, date: '15 May 2026' },
      recentTransactions,
    }))
  }

  useEffect(() => {
    ;(async () => {
      try {
        await loadDashboardData()
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  // Realtime: update balance when savings account changes
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
              totalBalance: newBalance,
            }))
            toast.info('Balance updated!')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [savingsAccountId])

  // Pull-to-refresh (simple): pull down at top triggers reload
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
    { title: 'Deposit', icon: ArrowDownLeft, href: '/deposit' },
    { title: 'Withdraw', icon: ArrowUpRight, href: '/withdraw' },
    { title: 'Transfer', icon: Send, href: '/transfer' },
    { title: 'Apply Loan', icon: FileText, href: '/loans/apply' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-md px-4">
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded-lg mb-4"></div>
            <div className="h-32 bg-gray-200 rounded-xl mb-4"></div>
            <div className="h-24 bg-gray-200 rounded-xl mb-3"></div>
            <div className="h-24 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {refreshing && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-30 bg-white shadow-sm border border-gray-200 text-xs px-3 py-1 rounded-full">
          Refreshing…
        </div>
      )}
      {/* Header with SANGA trademark */}
      <div className="bg-white border-b border-gray-100">
        <div className="px-4 pt-8 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 bg-[#1A2A4F] rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">S</span>
                </div>
                <span className="text-sm font-semibold text-[#1A2A4F]">SANGA™</span>
              </div>
              <p className="text-sm text-gray-500">Good {getGreeting()}</p>
              <h1 className="text-2xl font-bold text-gray-900">
                {user?.full_name?.split(' ')[0] || 'Member'}
              </h1>
            </div>
            <div className="flex gap-3">
              <button className="relative">
                <Bell className="h-5 w-5 text-gray-500" />
              </button>
              <button onClick={() => router.push('/profile')}>
                <User className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Connecting Africa&apos;s Wealth</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4">
        {/* My Wallet Card - SANGA colors */}
        <div className="-mt-4">
          <div className="bg-[#1A2A4F] rounded-xl shadow-lg p-5 text-white">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-blue-100 text-sm">My Wallet</p>
                <p className="text-xs opacity-75">SANGA™ Main Account</p>
              </div>
              <button onClick={() => setShowBalance(!showBalance)}>
                {showBalance ? <EyeOff className="h-4 w-4 text-blue-200" /> : <Eye className="h-4 w-4 text-blue-200" />}
              </button>
            </div>

            <div className="mb-4">
              <p className="text-3xl font-bold">
                {showBalance ? `KES ${memberData.totalBalance.toLocaleString()}` : '••••••'}
              </p>
              <p className="text-blue-100 text-xs mt-1">Available Balance</p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-blue-700">
              <div>
                <p className="text-blue-100 text-xs">Savings</p>
                <p className="text-sm font-semibold">
                  {showBalance ? `KES ${memberData.savings.toLocaleString()}` : '••••'}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-xs">Shares</p>
                <p className="text-sm font-semibold">
                  {showBalance ? `KES ${memberData.shares.toLocaleString()}` : '••••'}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-xs">Loan</p>
                <p className="text-sm font-semibold text-red-300">
                  {showBalance ? `KES ${memberData.loanBalance.toLocaleString()}` : '••••'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* What would you like to do today? */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            What would you like to do today?
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.title}
                onClick={() => router.push(action.href)}
                className="flex flex-col items-center gap-2"
              >
                <div className="bg-gray-100 p-3 rounded-xl">
                  <action.icon className="h-6 w-6 text-gray-700" />
                </div>
                <span className="text-xs font-medium text-gray-700">{action.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* My Accounts Section */}
        <div className="mt-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">My Accounts</h3>
              <span className="text-xs text-gray-500">All accounts</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Savings Account</p>
                  <p className="text-xs text-gray-400">SANGA Savings</p>
                </div>
                <p className="font-semibold">KES {memberData.savings.toLocaleString()}</p>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Share Capital</p>
                  <p className="text-xs text-gray-400">SANGA Shares</p>
                </div>
                <p className="font-semibold">KES {memberData.shares.toLocaleString()}</p>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Credit Score</p>
                  <p className="text-xs text-gray-400">SANGA Score</p>
                </div>
                <p className="font-semibold text-green-600">{memberData.creditScore}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Recent Activity</h3>
            <button
              onClick={() => router.push('/transactions')}
              className="text-xs text-[#D4AF37] hover:text-[#E67E22] transition-colors"
            >
              See all
            </button>
          </div>
          {memberData.recentTransactions.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent transactions</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {memberData.recentTransactions.map((tx) => (
                <div key={tx.id} className="p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      tx.type === 'deposit' ? 'bg-green-100' :
                      tx.type === 'withdrawal' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      {tx.type === 'deposit' && <ArrowDownLeft className="h-4 w-4 text-green-600" />}
                      {tx.type === 'withdrawal' && <ArrowUpRight className="h-4 w-4 text-red-600" />}
                      {tx.type === 'loan_repayment' && <Wallet className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-400">{tx.date}, {tx.time}</p>
                    </div>
                  </div>
                  <p className={`font-semibold text-sm ${
                    tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'deposit' ? '+' : '-'} KES {tx.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* What's New? - SANGA style */}
        <div className="mt-8 pb-8">
          <h3 className="font-semibold text-gray-900 mb-3">What&apos;s new?</h3>
          <div className="bg-gradient-to-r from-[#1A2A4F]/5 to-[#D4AF37]/5 rounded-xl p-4 border border-[#D4AF37]/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-[#D4AF37]/20 rounded-full flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#D4AF37]" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Lower Interest Rates</p>
                <p className="text-sm text-gray-600 mt-1">
                  SANGA™ members now enjoy reduced loan interest from 12% to 10%.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => router.push('/deposit')}
        className="fixed bottom-20 right-4 bg-[#D4AF37] w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-30"
        aria-label="Quick deposit"
      >
        <ArrowDownLeft className="h-6 w-6 text-[#1A2A4F]" />
      </button>

      <BottomNav />
    </div>
  )
}
