'use client'

import { ThreeDCard } from './Card3D'
import { type LucideIcon } from 'lucide-react'

interface StatCard3DProps {
  title: string
  value: string | number
  icon: LucideIcon
  /** Percent change vs prior period. Omit to hide the trend line. */
  trend?: number
  /** Free-form trend label override (e.g. "this week"). Defaults to "from last month". */
  trendLabel?: string
  /** Tailwind text color class for the icon (e.g. "text-white"). */
  iconColor?: string
  /** Tailwind gradient classes, e.g. "from-green-500 to-emerald-600". */
  gradient: string
}

export function StatCard3D({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel = 'from last month',
  iconColor = 'text-white',
  gradient,
}: StatCard3DProps) {
  return (
    <ThreeDCard glare scale={1.03} rotationFactor={10} perspective={800} radius={12}>
      <div
        className={`bg-gradient-to-br ${gradient} rounded-xl p-5 text-white shadow-xl h-full`}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-white/70 text-xs uppercase tracking-wider truncate">
              {title}
            </p>
            <p className="text-xl sm:text-2xl font-bold mt-1 truncate">{value}</p>
            {typeof trend === 'number' && (
              <p
                className={`text-xs mt-1 ${
                  trend > 0
                    ? 'text-green-200'
                    : trend < 0
                      ? 'text-red-200'
                      : 'text-white/60'
                }`}
              >
                {trend > 0 ? '↑ ' : trend < 0 ? '↓ ' : '— '}
                {Math.abs(trend)}% {trendLabel}
              </p>
            )}
          </div>
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      </div>
    </ThreeDCard>
  )
}
