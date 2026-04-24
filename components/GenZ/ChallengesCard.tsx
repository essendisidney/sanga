'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, TrendingUp, Gift, Sparkles, Users, Check } from 'lucide-react'
import { toast } from 'sonner'

/**
 * ChallengesCard
 *
 * Shows the top 3 active savings challenges for the caller. Progress
 * numbers come from the rules engine (rebuild_challenge_progress), so
 * if a bar reads 47% that's because the member really has 47% of the
 * target amount in deposits since enrolling.
 */

type Challenge = {
  id: string
  code: string
  title: string
  description: string | null
  rule_type: 'target_amount' | 'streak_weekly' | 'streak_monthly' | 'group_pool'
  target_amount: number | null
  deposits_required: number | null
  window_days: number | null
  pool_target: number | null
  reward_description: string | null
  reward_amount: number
  ends_at: string
  icon: string
  color_class: string
  pool_total: number
  participant_count: number
  my_participation: {
    status: 'active' | 'completed' | 'failed' | 'withdrawn'
    progress_amount: number
    progress_deposits: number
    progress_streak: number
    progress_pct: number
  } | null
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  TrendingUp,
  Gift,
  Sparkles,
}

function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

function poolPct(c: Challenge): number {
  if (c.rule_type !== 'group_pool' || !c.pool_target) return 0
  return Math.min(100, Math.round((c.pool_total / c.pool_target) * 100))
}

export function ChallengesCard({ compact = false }: { compact?: boolean }) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load challenges')
      const data = await res.json()
      setChallenges(data.challenges ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleJoin = async (id: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/challenges/${id}/join`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join')
      toast.success('Challenge joined')
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not join')
    } finally {
      setBusy(null)
    }
  }

  const handleLeave = async (id: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/challenges/${id}/leave`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to leave')
      toast.success('Left challenge')
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not leave')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return null
  if (challenges.length === 0) return null

  const shown = compact ? challenges.slice(0, 2) : challenges

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-secondary" />
        <h2 className="text-sm font-semibold text-gray-900">Savings Challenges</h2>
      </div>

      {shown.map((c, i) => {
        const Icon = iconMap[c.icon] ?? Sparkles
        const enrolled = c.my_participation?.status === 'active'
        const completed = c.my_participation?.status === 'completed'
        const pct =
          c.rule_type === 'group_pool'
            ? poolPct(c)
            : Math.min(100, Math.round(c.my_participation?.progress_pct ?? 0))
        const left = daysLeft(c.ends_at)

        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`rounded-xl bg-gradient-to-r ${c.color_class} p-4 text-white shadow-sm`}
          >
            <div className="flex items-start gap-3">
              <Icon className="h-6 w-6 shrink-0 opacity-80" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{c.title}</h3>
                  {completed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase">
                      <Check className="h-3 w-3" /> Done
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="mt-1 text-sm text-white/85">{c.description}</p>
                )}

                {/* Progress bar */}
                {(enrolled || completed || c.rule_type === 'group_pool') && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white/90 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-white/80">
                      <span>
                        {c.rule_type === 'target_amount' && c.my_participation && (
                          <>
                            KES {Number(c.my_participation.progress_amount).toLocaleString()} /{' '}
                            {Number(c.target_amount).toLocaleString()}
                          </>
                        )}
                        {(c.rule_type === 'streak_weekly' ||
                          c.rule_type === 'streak_monthly') &&
                          c.my_participation && (
                            <>Streak: {c.my_participation.progress_streak}</>
                          )}
                        {c.rule_type === 'group_pool' && (
                          <>
                            KES {Number(c.pool_total).toLocaleString()} /{' '}
                            {Number(c.pool_target).toLocaleString()}
                          </>
                        )}
                      </span>
                      <span>
                        {left} day{left === 1 ? '' : 's'} left
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  {!enrolled && !completed && (
                    <button
                      onClick={() => handleJoin(c.id)}
                      disabled={busy === c.id}
                      className="rounded-lg bg-white/15 px-3 py-1 text-xs font-medium transition hover:bg-white/25 disabled:opacity-50"
                    >
                      {busy === c.id ? 'Joining…' : 'Join challenge'}
                    </button>
                  )}
                  {enrolled && (
                    <button
                      onClick={() => handleLeave(c.id)}
                      disabled={busy === c.id}
                      className="rounded-lg bg-white/10 px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      {busy === c.id ? 'Leaving…' : 'Leave'}
                    </button>
                  )}
                  {c.rule_type === 'group_pool' && c.participant_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-white/80">
                      <Users className="h-3 w-3" />
                      {c.participant_count} joined
                    </span>
                  )}
                  {c.reward_description && (
                    <span className="text-[11px] text-white/70">
                      · Reward: {c.reward_description}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
