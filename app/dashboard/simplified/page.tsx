'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import { ExperienceToggle } from '@/components/ExperienceToggle'
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Phone,
  MapPin,
  Receipt,
  HelpCircle,
  User,
  Bell,
} from 'lucide-react'

type SimplifiedData = {
  full_name: string
  savings: number
  shares: number
  loan_balance: number
  total_balance: number
  sacco_name: string
  support_phone: string | null
  support_email: string | null
  loaded: boolean
  has_membership: boolean
}

const INITIAL: SimplifiedData = {
  full_name: '',
  savings: 0,
  shares: 0,
  loan_balance: 0,
  total_balance: 0,
  sacco_name: 'SANGA',
  support_phone: null,
  support_email: null,
  loaded: false,
  has_membership: false,
}

export default function SimplifiedDashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<SimplifiedData>(INITIAL)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/login')
        return
      }

      // Honour the user's saved preference. If they're not on
      // simplified, route them back to the regular dashboard.
      try {
        const prefRes = await fetch('/api/me/preferences', { cache: 'no-store' })
        if (prefRes.ok) {
          const pref = await prefRes.json()
          if (pref?.experience_mode && pref.experience_mode !== 'simplified') {
            setRedirecting(true)
            router.replace('/dashboard')
            return
          }
        }
      } catch {
        // non-fatal — keep showing simplified
      }

      const profile = await supabase
        .from('users')
        .select('full_name')
        .eq('id', authUser.id)
        .maybeSingle()

      const fullName =
        (authUser.user_metadata as any)?.full_name ||
        profile.data?.full_name ||
        'Member'

      const membership = await supabase
        .from('sacco_memberships')
        .select('id, sacco_id')
        .eq('user_id', authUser.id)
        .maybeSingle()

      if (!membership.data) {
        if (!cancelled) {
          setData({
            ...INITIAL,
            full_name: fullName,
            loaded: true,
            has_membership: false,
          })
        }
        return
      }

      const [accounts, sacco] = await Promise.all([
        supabase
          .from('member_accounts')
          .select('balance, account_type')
          .eq('sacco_membership_id', membership.data.id),
        supabase
          .from('saccos')
          .select('name, contact_phone, contact_email')
          .eq('id', membership.data.sacco_id)
          .maybeSingle(),
      ])

      const savings = Number(
        accounts.data?.find((a) => a.account_type === 'savings')?.balance ?? 0,
      )
      const shares = Number(
        accounts.data?.find((a) => a.account_type === 'shares')?.balance ?? 0,
      )
      const loanBalance = Number(
        accounts.data?.find((a) => a.account_type === 'loan')?.balance ?? 0,
      )

      if (!cancelled) {
        setData({
          full_name: fullName,
          savings,
          shares,
          loan_balance: loanBalance,
          total_balance: savings + shares,
          sacco_name: sacco.data?.name || 'SANGA',
          support_phone: sacco.data?.contact_phone || null,
          support_email: sacco.data?.contact_email || null,
          loaded: true,
          has_membership: true,
        })
      }
    }

    load().catch((err) => {
      console.error(err)
      if (!cancelled) {
        toast.error('Could not load your dashboard')
        setData((d) => ({ ...d, loaded: true }))
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tiles: Array<{
    label: string
    emoji: string
    icon: typeof ArrowDownLeft
    href: string
    bg: string
  }> = [
    {
      label: 'Deposit',
      emoji: '💰',
      icon: ArrowDownLeft,
      href: '/deposit',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Withdraw',
      emoji: '💸',
      icon: ArrowUpRight,
      href: '/withdraw',
      bg: 'bg-rose-50',
    },
    {
      label: 'Apply for loan',
      emoji: '📄',
      icon: FileText,
      href: '/loans/apply',
      bg: 'bg-violet-50',
    },
    {
      label: 'Statement',
      emoji: '📊',
      icon: Receipt,
      href: '/transactions',
      bg: 'bg-blue-50',
    },
    {
      label: 'My profile',
      emoji: '👤',
      icon: User,
      href: '/profile',
      bg: 'bg-amber-50',
    },
    {
      label: 'Help',
      emoji: '❓',
      icon: HelpCircle,
      href: '/support',
      bg: 'bg-slate-50',
    },
  ]

  if (!data.loaded || redirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500 text-lg">
        Loading…
      </div>
    )
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const firstName = data.full_name?.split(' ')[0] || 'Member'

  return (
    <div className="min-h-screen bg-gray-50 pb-24 text-gray-900">
      {/* Header */}
      <div className="bg-primary text-white">
        <div className="max-w-md mx-auto px-5 pt-8 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-white/80 text-base">{greeting},</p>
              <h1 className="text-2xl font-bold mt-0.5">{firstName}</h1>
              <p className="text-white/70 text-sm mt-1">{data.sacco_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <ExperienceToggle />
              <button
                onClick={() => router.push('/notifications')}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-md mx-auto px-5 -mt-4 space-y-6">
        {/* Big balance card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-center"
        >
          <p className="text-gray-500 text-base">Your balance</p>
          <p className="text-4xl font-bold mt-2 text-primary">
            KES {data.total_balance.toLocaleString()}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500">Savings</p>
              <p className="font-semibold text-base mt-0.5">
                KES {data.savings.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500">Shares</p>
              <p className="font-semibold text-base mt-0.5">
                KES {data.shares.toLocaleString()}
              </p>
            </div>
          </div>
          {data.loan_balance > 0 && (
            <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-3 text-sm">
              <p className="text-rose-700">Outstanding loan</p>
              <p className="font-semibold text-base text-rose-900 mt-0.5">
                KES {data.loan_balance.toLocaleString()}
              </p>
            </div>
          )}
        </motion.div>

        {/* 2x3 action grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="grid grid-cols-2 gap-4"
        >
          {tiles.map((t) => (
            <button
              key={t.label}
              onClick={() => router.push(t.href)}
              className={`p-5 rounded-2xl shadow-sm border border-gray-200 ${t.bg} text-center hover:shadow-md active:scale-[0.98] transition`}
            >
              <span className="text-3xl block leading-none">{t.emoji}</span>
              <span className="text-base font-medium block mt-2">{t.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Prominent support */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center"
        >
          <p className="text-amber-900 text-base">Need help?</p>
          {data.support_phone ? (
            <a
              href={`tel:${data.support_phone.replace(/\s+/g, '')}`}
              className="block mt-2"
            >
              <span className="text-2xl font-bold text-amber-900 block">
                {data.support_phone}
              </span>
              <span className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-amber-900 text-white rounded-full text-sm font-medium">
                <Phone className="h-4 w-4" /> Tap to call
              </span>
            </a>
          ) : (
            <p className="text-sm text-amber-800 mt-2">
              Contact details will appear here once your SACCO sets them up.
            </p>
          )}
          {data.support_email && (
            <a
              href={`mailto:${data.support_email}`}
              className="block text-sm text-amber-800 underline mt-3"
            >
              {data.support_email}
            </a>
          )}
          <p className="text-xs text-amber-700 mt-3">
            Or message us via{' '}
            <button
              onClick={() => router.push('/contact')}
              className="underline font-medium"
            >
              <MapPin className="inline h-3 w-3" /> contact us
            </button>
          </p>
        </motion.div>

        {/* Switch back hint */}
        <p className="text-center text-xs text-gray-400 pt-2">
          Want more features? Tap <strong>Simplified</strong> at the top to switch
          back to the digital view.
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
