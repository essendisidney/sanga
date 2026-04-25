'use client'

import { ThreeDCard } from './Card3D'
import { ArrowUpRight, ArrowDownRight, Send, Wallet } from 'lucide-react'

// Per-transaction 3D tilt card. Each instance subscribes to its own
// MotionValues + spring + glare gradient — that's noticeable per-frame
// work for long lists. Use this for transaction *detail* views or
// short featured-tx surfaces. For dashboard transaction lists prefer
// a flat row with a hover background.

interface TransactionCard3DProps {
  type: 'deposit' | 'withdrawal' | 'transfer' | string
  amount: number
  description: string
  date: string
  status?: 'completed' | 'pending' | 'failed' | string
}

const ICONS = {
  deposit:    { Icon: ArrowDownRight, fg: 'text-green-600', bg: 'bg-green-100' },
  withdrawal: { Icon: ArrowUpRight,   fg: 'text-red-600',   bg: 'bg-red-100'   },
  transfer:   { Icon: Send,           fg: 'text-blue-600',  bg: 'bg-blue-100'  },
} as const

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-green-700 bg-green-100',
  pending:   'text-yellow-700 bg-yellow-100',
  failed:    'text-red-700 bg-red-100',
}

export function TransactionCard3D({
  type,
  amount,
  description,
  date,
  status,
}: TransactionCard3DProps) {
  const isPositive = type === 'deposit'
  const meta = (ICONS as Record<string, { Icon: typeof Wallet; fg: string; bg: string }>)[type] ?? {
    Icon: Wallet,
    fg: 'text-blue-600',
    bg: 'bg-blue-100',
  }
  const StatusIcon = meta.Icon

  return (
    <ThreeDCard glare scale={1.01} rotationFactor={8} perspective={600} radius={12}>
      <div className="bg-white rounded-xl p-4 cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-3 rounded-xl shrink-0 ${meta.bg}`}>
              <StatusIcon className={`h-5 w-5 ${meta.fg}`} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{description}</p>
              <p className="text-xs text-gray-400">{date}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p
              className={`font-bold ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {isPositive ? '+' : '-'} KES {amount.toLocaleString()}
            </p>
            {status && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  STATUS_BADGE[status] ?? 'text-gray-700 bg-gray-100'
                }`}
              >
                {status}
              </span>
            )}
          </div>
        </div>
      </div>
    </ThreeDCard>
  )
}
