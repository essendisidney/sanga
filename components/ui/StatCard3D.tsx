'use client'

import type { LucideIcon } from 'lucide-react'
import { ThreeDCard } from './Card3D'

interface StatCard3DProps {
  title: string
  value: string | number
  icon: LucideIcon
  /** Trend percent, signed. Omit to hide the trend row. */
  trend?: number
  /** Tailwind text color class for the icon (e.g. "text-green-200"). */
  iconColorClass?: string
  /** Tailwind gradient classes for the card body (e.g. "from-green-500 to-emerald-600"). */
  gradient: string
  trendPeriod?: string
}

// 3D stat tile. Reusable on dashboards or any KPI surface.
export function StatCard3D({
  title,
  value,
  icon: Icon,
  trend,
  iconColorClass = 'text-white',
  gradient,
  trendPeriod = 'last month',
}: StatCard3DProps) {
  return (
    <ThreeDCard glare scale={1.03} rotationFactor={10} perspective={800} radius={14}>
      <div className={`bg-gradient-to-br ${gradient} rounded-xl p-5 text-white shadow-xl`}>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <p className="text-white/70 text-xs uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            {trend !== undefined && (
              <p
                className={`text-xs mt-1 ${
                  trend >= 0 ? 'text-green-200' : 'text-red-200'
                }`}
              >
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% from {trendPeriod}
              </p>
            )}
          </div>
          <div className="p-3 bg-white/15 rounded-xl backdrop-blur-sm shrink-0">
            <Icon className={`h-5 w-5 ${iconColorClass}`} />
          </div>
        </div>
      </div>
    </ThreeDCard>
  )
}
