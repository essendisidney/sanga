'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Settings, Sparkles, Smartphone, Shield, Layers } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export type ExperienceMode = 'digital' | 'simplified' | 'hybrid'

const MODES: Array<{
  id: ExperienceMode
  name: string
  short: string
  icon: typeof Smartphone
  description: string
  color: string
  audience: string
}> = [
  {
    id: 'digital',
    name: 'Digital first',
    short: 'Digital',
    icon: Smartphone,
    description: 'Full features, instant decisions, social feed.',
    color: 'from-purple-500 to-pink-500',
    audience: 'Fast-paced, mobile-native',
  },
  {
    id: 'simplified',
    name: 'Simplified',
    short: 'Simplified',
    icon: Shield,
    description: 'Larger text, fewer choices, prominent support.',
    color: 'from-blue-500 to-cyan-500',
    audience: 'Calm and clear',
  },
  {
    id: 'hybrid',
    name: 'Hybrid',
    short: 'Hybrid',
    icon: Layers,
    description: 'Big balance card up top, full feature set below.',
    color: 'from-emerald-500 to-teal-500',
    audience: 'Customise as you go',
  },
]

/**
 * Server-persisted UI preference toggle.
 *
 * - Loads the saved preference from /api/me/preferences (DB-backed,
 *   so it follows the user across devices).
 * - Mirrors to localStorage as a fast-path so first paint after login
 *   doesn't flicker.
 * - Saves new choices via PATCH /api/me/preferences and refreshes the
 *   route so the new layout is rendered. We do NOT use
 *   window.location.reload() — that would lose any other in-flight
 *   client state (open modals, unsubmitted forms).
 * - Auto-routes between /dashboard and /dashboard/simplified when the
 *   user is currently on a dashboard route, so the new preference
 *   takes effect immediately.
 */
export function ExperienceToggle() {
  const router = useRouter()
  const pathname = usePathname()

  const [mode, setMode] = useState<ExperienceMode>('digital')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const cached =
      typeof window !== 'undefined'
        ? (localStorage.getItem('sanga_experience_mode') as ExperienceMode | null)
        : null
    if (cached && (['digital', 'simplified', 'hybrid'] as const).includes(cached)) {
      setMode(cached)
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/preferences', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const fresh = (json?.experience_mode as ExperienceMode) || 'digital'
        setMode(fresh)
        try {
          localStorage.setItem('sanga_experience_mode', fresh)
        } catch {}
      } catch {
        // network failure — keep cached value, no UI noise
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-experience-toggle]')) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const handleModeChange = async (next: ExperienceMode) => {
    if (next === mode || saving) {
      setOpen(false)
      return
    }

    setSaving(true)
    const previous = mode
    setMode(next) // optimistic

    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experience_mode: next }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Could not save preference')
      }

      try {
        localStorage.setItem('sanga_experience_mode', next)
      } catch {}

      toast.success(`Switched to ${MODES.find((m) => m.id === next)?.name}`)

      // route the user to the layout that matches their new choice
      if (pathname?.startsWith('/dashboard')) {
        if (next === 'simplified' && pathname !== '/dashboard/simplified') {
          router.push('/dashboard/simplified')
        } else if (next !== 'simplified' && pathname === '/dashboard/simplified') {
          router.push('/dashboard')
        } else {
          router.refresh()
        }
      } else {
        router.refresh()
      }
    } catch (err) {
      setMode(previous) // rollback
      toast.error(err instanceof Error ? err.message : 'Could not save preference')
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  const current = MODES.find((m) => m.id === mode) ?? MODES[0]
  const Icon = current.icon

  return (
    <div className="relative" data-experience-toggle>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change experience mode"
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{current.short}</span>
        <Settings className="h-3 w-3 opacity-70" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 p-3 text-gray-900"
            role="menu"
          >
            <div className="px-2 pb-2 pt-1">
              <h3 className="font-semibold text-sm">Choose your experience</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                You can switch any time — your choice follows you across devices.
              </p>
            </div>

            <div className="space-y-1.5">
              {MODES.map((m) => {
                const ItemIcon = m.icon
                const active = m.id === mode
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    disabled={saving}
                    onClick={() => handleModeChange(m.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition ${
                      active
                        ? `bg-gradient-to-r ${m.color} text-white shadow-md`
                        : 'hover:bg-gray-50'
                    } disabled:opacity-60`}
                  >
                    <ItemIcon
                      className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                        active ? 'text-white' : 'text-gray-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium text-sm ${
                          active ? 'text-white' : 'text-gray-900'
                        }`}
                      >
                        {m.name}
                      </p>
                      <p
                        className={`text-xs ${
                          active ? 'text-white/85' : 'text-gray-500'
                        }`}
                      >
                        {m.description}
                      </p>
                      <p
                        className={`text-[11px] mt-1 ${
                          active ? 'text-white/70' : 'text-gray-400'
                        }`}
                      >
                        {m.audience}
                      </p>
                    </div>
                    {active && (
                      <Sparkles className="h-4 w-4 text-yellow-300 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                )
              })}
            </div>

            <p className="text-[11px] text-gray-400 mt-3 text-center">
              Saved to your profile · syncs across devices
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
