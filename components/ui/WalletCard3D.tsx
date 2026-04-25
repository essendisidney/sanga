'use client'

import { useState } from 'react'
import { ThreeDCard } from './Card3D'
import { CreditCard, Eye, EyeOff, Copy, Check } from 'lucide-react'

// Premium wallet card aesthetic.
//
// Notes:
//   - Brand colors come from globals.css tokens (--color-primary*, --color-secondary*),
//     not hardcoded hex. If the brand changes, this card follows automatically.
//   - We accept a free-form memberNumber string; SANGA accounts are KES-denominated
//     SACCO accounts, not 16-digit card numbers, so callers should pass whatever
//     identifier makes sense (member number, masked phone, account ref).
//   - balance / breakdown values are rendered verbatim — formatting is the caller's
//     responsibility so the same card works across simplified/digital/dashboard modes.

export interface WalletCard3DBreakdownItem {
  label: string
  value: number
  /** 0..100, controls the bar fill. If omitted no bar is rendered. */
  progressPct?: number
  /** Tailwind color class for the bar; defaults to gold accent. */
  barClass?: string
}

interface WalletCard3DProps {
  balance: number
  memberNumber: string
  memberName: string
  showBalance: boolean
  onToggleBalance: () => void
  /** Optional sub-breakdown rendered under the balance (savings/shares/loan etc.). */
  breakdown?: WalletCard3DBreakdownItem[]
  /** Override the "Premium Member Card" subtitle. */
  tier?: string
  /** Override the "Valid Thru" hint or hide it by passing null. */
  validThru?: string | null
}

export function WalletCard3D({
  balance,
  memberNumber,
  memberName,
  showBalance,
  onToggleBalance,
  breakdown,
  tier = 'Premium Member',
  validThru = null,
}: WalletCard3DProps) {
  const [copied, setCopied] = useState(false)

  const copyMemberNumber = async () => {
    try {
      await navigator.clipboard.writeText(memberNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Some browsers reject clipboard writes off a non-user gesture or
      // without https. Silent — caller can wire its own toast if needed.
    }
  }

  return (
    <ThreeDCard glare scale={1.02} rotationFactor={12} perspective={1200} radius={20}>
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-2xl"
        style={{
          background:
            'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 50%, var(--color-primary-dark) 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div
            className="absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl"
            style={{ background: 'var(--color-secondary)' }}
          />
          <div
            className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-3xl"
            style={{ background: 'var(--color-secondary)' }}
          />
        </div>

        <div className="absolute top-6 right-6 pointer-events-none">
          <svg width="38" height="28" viewBox="0 0 50 40" fill="none" aria-hidden>
            <rect
              x="5"
              y="5"
              width="40"
              height="30"
              rx="4"
              fill="var(--color-secondary)"
              fillOpacity="0.18"
              stroke="var(--color-secondary)"
              strokeWidth="1.5"
            />
            <line x1="15" y1="5" x2="15" y2="35" stroke="var(--color-secondary)" strokeOpacity="0.5" />
            <line x1="25" y1="5" x2="25" y2="35" stroke="var(--color-secondary)" strokeOpacity="0.5" />
            <line x1="35" y1="5" x2="35" y2="35" stroke="var(--color-secondary)" strokeOpacity="0.5" />
            <line x1="5" y1="15" x2="45" y2="15" stroke="var(--color-secondary)" strokeOpacity="0.5" />
            <line x1="5" y1="25" x2="45" y2="25" stroke="var(--color-secondary)" strokeOpacity="0.5" />
          </svg>
        </div>

        <div className="relative mb-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" style={{ color: 'var(--color-secondary)' }} />
            <span className="text-lg font-bold tracking-[0.2em]">SANGA</span>
          </div>
          <p className="text-xs text-white/60 mt-1">{tier}</p>
        </div>

        <div className="relative mb-4">
          <p className="text-xs text-white/50 mb-1">Member Number</p>
          <div className="flex items-center gap-2">
            <p className="text-base font-mono tracking-wider">{memberNumber}</p>
            <button
              onClick={copyMemberNumber}
              className="p-1 hover:bg-white/10 rounded transition"
              aria-label="Copy member number"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-300" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-white/60" />
              )}
            </button>
          </div>
        </div>

        <div className="relative mb-4">
          <p className="text-xs text-white/50 mb-1">Card Holder</p>
          <p className="text-base font-semibold tracking-wider truncate">{memberName}</p>
        </div>

        <div className="relative border-t border-white/15 pt-4 mt-2">
          <div className="flex justify-between items-center">
            <div className="min-w-0">
              <p className="text-xs text-white/50">Available Balance</p>
              <p className="text-3xl font-bold font-serif">
                {showBalance ? `KES ${balance.toLocaleString()}` : '••••••'}
              </p>
            </div>
            <button
              onClick={onToggleBalance}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition shrink-0"
              aria-label={showBalance ? 'Hide balance' : 'Show balance'}
            >
              {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {breakdown && breakdown.length > 0 && (
            <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: `repeat(${breakdown.length}, minmax(0, 1fr))` }}>
              {breakdown.map((item) => (
                <div key={item.label} className="min-w-0">
                  <p className="text-white/50 text-[10px] tracking-wider uppercase">
                    {item.label}
                  </p>
                  <p className="text-sm font-semibold mt-1 truncate">
                    {showBalance ? `KES ${item.value.toLocaleString()}` : '••••'}
                  </p>
                  {typeof item.progressPct === 'number' && (
                    <div className="w-full bg-white/15 rounded-full h-1 mt-2">
                      <div
                        className={`rounded-full h-1 transition-all ${item.barClass ?? ''}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, item.progressPct))}%`,
                          background: item.barClass ? undefined : 'var(--color-secondary)',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {validThru && (
          <p className="absolute bottom-5 right-6 text-xs text-white/30">
            Valid Thru {validThru}
          </p>
        )}
      </div>
    </ThreeDCard>
  )
}
