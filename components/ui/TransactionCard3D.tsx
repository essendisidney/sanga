'use client'

import { ArrowDownLeft, ArrowUpRight, Send, Wallet } from 'lucide-react'
import { ThreeDCard } from './Card3D'

interface TransactionCard3DProps {
  type: 'deposit' | 'withdrawal' | 'transfer' | string
  amount: number
  description: string
  date: string
  status: 'completed' | 'pending' | 'failed'
  onClick?: () => void
}

const ICONS = {
  deposit: { Icon: ArrowDownLeft, color: 'text-green-600', bg: 'bg-green-100' },
  withdrawal: { Icon: ArrowUpRight, color: 'text-red-600', bg: 'bg-red-100' },
  transfer: { Icon: Send, color: 'text-blue-600', bg: 'bg-blue-100' },
} as const

const STATUS_PILL = {
  completed: 'text-green-700 bg-green-100',
  pending: 'text-yellow-700 bg-yellow-100',
  failed: 'text-red-700 bg-red-100',
}

export function TransactionCard3D({
  type,
  amount,
  description,
  date,
  status,
  onClick,
}: TransactionCard3DProps) {
  const isPositive = type === 'deposit'
  const config =
    (ICONS as Record<string, (typeof ICONS)[keyof typeof ICONS]>)[type] ?? {
      Icon: Wallet,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    }
  const Icon = config.Icon

  return (
    <ThreeDCard glare scale={1.015} rotationFactor={6} perspective={700} radius={12}>
      <button
        onClick={onClick}
        type="button"
        className="w-full text-left bg-white rounded-xl p-4 shadow-sm cursor-pointer"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-3 rounded-xl shrink-0 ${config.bg}`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
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
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${STATUS_PILL[status]}`}
            >
              {status}
            </span>
          </div>
        </div>
      </button>
    </ThreeDCard>
  )
}
