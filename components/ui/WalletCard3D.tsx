'use client'

import { useState } from 'react'
import { CreditCard, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { ThreeDCard } from './Card3D'

interface WalletCard3DProps {
  balance: number
  accountNumber: string
  memberName: string
  showBalance: boolean
  onToggleBalance: () => void
  /** Optional sub-text under the card brand (e.g. "Premium Member Card"). */
  subtitle?: string
}

export function WalletCard3D({
  balance,
  accountNumber,
  memberName,
  showBalance,
  onToggleBalance,
  subtitle = 'SANGA Member Card',
}: WalletCard3DProps) {
  const [copied, setCopied] = useState(false)

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access denied (insecure context) — silent fail.
    }
  }

  return (
    <ThreeDCard glare scale={1.025} rotationFactor={12} perspective={1200} radius={20}>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-dark to-primary-light p-6 text-white shadow-2xl min-h-[240px]">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-secondary rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: '1s' }}
          />
        </div>

        <div className="absolute top-6 right-6 pointer-events-none">
          <svg width="40" height="30" viewBox="0 0 50 40" fill="none" aria-hidden>
            <rect
              x="5"
              y="5"
              width="40"
              height="30"
              rx="4"
              fill="currentColor"
              fillOpacity="0.18"
              className="text-secondary"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <line x1="15" y1="5" x2="15" y2="35" stroke="currentColor" strokeOpacity="0.5" className="text-secondary" />
            <line x1="25" y1="5" x2="25" y2="35" stroke="currentColor" strokeOpacity="0.5" className="text-secondary" />
            <line x1="35" y1="5" x2="35" y2="35" stroke="currentColor" strokeOpacity="0.5" className="text-secondary" />
            <line x1="5" y1="15" x2="45" y2="15" stroke="currentColor" strokeOpacity="0.5" className="text-secondary" />
            <line x1="5" y1="25" x2="45" y2="25" stroke="currentColor" strokeOpacity="0.5" className="text-secondary" />
          </svg>
        </div>

        <div className="relative">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-secondary" />
              <span className="text-xl font-bold tracking-wider font-serif">SANGA</span>
            </div>
            <p className="text-xs text-white/50 mt-1">{subtitle}</p>
          </div>

          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Account</p>
            <div className="flex items-center gap-2">
              <p className="text-base font-mono tracking-wider">{accountNumber}</p>
              <button
                onClick={copyAccountNumber}
                className="p-1 hover:bg-white/10 rounded transition"
                aria-label="Copy account number"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3 text-white/60" />
                )}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Card Holder</p>
            <p className="text-base font-semibold tracking-wider truncate">{memberName}</p>
          </div>

          <div className="border-t border-white/15 pt-4 flex justify-between items-end">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Total Balance</p>
              <p className="text-3xl font-bold font-serif">
                {showBalance ? `KES ${balance.toLocaleString()}` : '••••••'}
              </p>
            </div>
            <button
              onClick={onToggleBalance}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"
              aria-label={showBalance ? 'Hide balance' : 'Show balance'}
            >
              {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </ThreeDCard>
  )
}
