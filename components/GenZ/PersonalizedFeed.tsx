'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Target,
  BookOpen,
  TrendingUp,
  Gift,
  Unlock,
  Zap,
  X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

/**
 * PersonalizedFeed
 *
 * Fetches recommendations from /api/me/recommendations. If the backend has
 * stored recs for this user, those render. Otherwise derived recs (computed
 * from the member's REAL state — actual savings, actual credit score, actual
 * loan status) are shown instead.
 *
 * No hardcoded "Pre-approved KES 50,000 loan" cards — if that line renders,
 * the user really is eligible for exactly that amount.
 */

const iconMap: Record<string, React.ComponentType<any>> = {
  Target,
  BookOpen,
  TrendingUp,
  Gift,
  Unlock,
  Zap,
  Sparkles,
}

type Recommendation = {
  id: string
  recommendation_type: string
  title: string
  description: string | null
  action_url: string | null
  action_label: string | null
  icon: string | null
  color_class: string | null
  is_dismissed: boolean
}

export function PersonalizedFeed() {
  const router = useRouter()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [derived, setDerived] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await fetch('/api/me/recommendations', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load recommendations')
      const data = await res.json()
      setRecommendations(data.recommendations || [])
      setDerived(Boolean(data.derived))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDismiss = async (id: string) => {
    if (id.startsWith('derived-')) {
      // Can't dismiss derived; just optimistically remove from UI
      setRecommendations((prev) => prev.filter((r) => r.id !== id))
      return
    }
    setRecommendations((prev) => prev.filter((r) => r.id !== id))
    try {
      await fetch('/api/me/recommendations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, dismissed: true }),
      })
    } catch (err) {
      console.error(err)
      toast.error('Could not dismiss')
      load()
    }
  }

  if (loading) return null
  if (recommendations.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-secondary" />
        <h2 className="text-sm font-semibold text-gray-900">For you</h2>
        {derived && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
            live · from your activity
          </span>
        )}
      </div>

      {recommendations.map((rec, i) => {
        const Icon = (rec.icon && iconMap[rec.icon]) || Sparkles
        const color = rec.color_class || 'from-slate-600 to-gray-700'
        return (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`group relative rounded-xl bg-gradient-to-r ${color} p-4 text-white shadow-sm transition hover:shadow-lg`}
          >
            <button
              aria-label="Dismiss"
              onClick={() => handleDismiss(rec.id)}
              className="absolute right-2 top-2 rounded-full p-1 text-white/50 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
            <div className="flex items-start gap-3">
              <Icon className="h-6 w-6 shrink-0 opacity-80" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{rec.title}</h3>
                {rec.description && (
                  <p className="mt-1 text-sm text-white/85">{rec.description}</p>
                )}
                {rec.action_url && (
                  <button
                    onClick={() => router.push(rec.action_url as string)}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1 text-xs font-medium transition hover:bg-white/25"
                  >
                    {rec.action_label || 'Open'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
