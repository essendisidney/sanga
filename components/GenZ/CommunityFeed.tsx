'use client'

import { useEffect, useState } from 'react'
import {
  TrendingUp,
  Users,
  Coins,
  Award,
  Loader2,
  Zap,
  BookOpen,
} from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * CommunityFeed
 *
 * Real aggregated SACCO activity. Every number comes from a database query;
 * every "milestone" is a real event (anonymized to initials). No invented
 * users, no fake testimonials, no randomuser.me avatars.
 *
 * Data source: /api/community/feed (aggregation endpoint)
 */

type Stats = {
  deposits_today: number
  deposits_amount_today: number
  new_loans_this_week: number
  new_members_this_month: number
  active_members: number
  total_savings: number
}

type Milestone = {
  kind: string
  initial: string
  time_ago: string
  amount?: number
}

type Tip = {
  title: string
  description: string
}

type FeedData = {
  stats: Stats
  milestones: Milestone[]
  tips: Tip[]
}

export function CommunityFeed() {
  const [data, setData] = useState<FeedData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/community/feed', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed')
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading community activity…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-gray-500">
        Could not load the community feed right now.
      </div>
    )
  }

  const { stats, milestones, tips } = data

  return (
    <div className="space-y-5">
      {/* Aggregated stats header — real numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Coins}
          label="Deposits today"
          value={stats.deposits_today.toString()}
          sub={`KES ${stats.deposits_amount_today.toLocaleString()}`}
          color="from-green-500 to-emerald-600"
        />
        <StatCard
          icon={Zap}
          label="Loans this week"
          value={stats.new_loans_this_week.toString()}
          color="from-purple-500 to-indigo-600"
        />
        <StatCard
          icon={Users}
          label="Active members"
          value={stats.active_members.toString()}
          sub={`+${stats.new_members_this_month} this month`}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Total savings"
          value={`KES ${formatCompact(stats.total_savings)}`}
          color="from-amber-500 to-orange-600"
        />
      </div>

      {/* Milestones — real events, names anonymized to initials */}
      {milestones.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Award className="h-4 w-4 text-secondary" />
            This week in the community
          </h2>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <motion.div
                key={`${m.kind}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white ${
                      m.kind === 'loan_repaid'
                        ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                        : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                    }`}
                  >
                    {m.initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      {m.kind === 'loan_repaid' ? (
                        <>
                          <strong>{m.initial}</strong> fully repaid a loan
                          {m.amount ? ` of KES ${m.amount.toLocaleString()}` : ''}
                        </>
                      ) : (
                        <>
                          <strong>{m.initial}</strong> deposited
                          {m.amount ? ` KES ${m.amount.toLocaleString()}` : ''}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{m.time_ago}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Names shown as initials to protect member privacy.
          </p>
        </div>
      )}

      {/* Financial education tips — curated, not UGC */}
      {tips.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BookOpen className="h-4 w-4 text-secondary" />
            Financial tips
          </h2>
          <div className="space-y-2">
            {tips.map((t, i) => (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl bg-gradient-to-r from-slate-50 to-gray-50 p-4"
              >
                <p className="font-medium text-gray-900">{t.title}</p>
                <p className="mt-1 text-sm text-gray-600">{t.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<any>
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} p-3 text-white shadow-sm`}>
      <Icon className="mb-1 h-4 w-4 opacity-80" />
      <p className="text-[10px] uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-white/75">{sub}</p>}
    </div>
  )
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toString()
}
