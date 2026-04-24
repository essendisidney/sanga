'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Users, ExternalLink } from 'lucide-react'
import Link from 'next/link'

/**
 * FamilyGuarantorPicker
 *
 * Loan-flow picker that surfaces family members who have consented to
 * guarantee the caller's loans (accepted family_link with
 * can_guarantee=TRUE). Multi-select; selected guarantor_ids are
 * forwarded to the loan application payload.
 *
 * Hides itself if there are no eligible family guarantors; the loan
 * flow then falls back to its existing "enter phone numbers" path.
 */

type Guarantor = {
  user_id: string
  full_name: string | null
  relationship: string
  phone: string | null
  link_id: string
}

export function FamilyGuarantorPicker({
  selected,
  onChange,
  maxSelections,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  maxSelections?: number
}) {
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/family-guarantors', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setGuarantors(data.guarantors ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
      return
    }
    if (maxSelections && selected.length >= maxSelections) return
    onChange([...selected, id])
  }

  if (loading) return null
  if (guarantors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <Users className="mb-2 h-4 w-4 text-gray-400" />
        No family guarantors yet.{' '}
        <Link href="/family" className="font-medium text-primary underline">
          Invite a family member
        </Link>{' '}
        to skip typing phone numbers next time.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          Your family guarantors
        </div>
        <Link
          href="/family"
          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          Manage <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-1.5">
        {guarantors.map((g) => {
          const isSelected = selected.includes(g.user_id)
          return (
            <button
              type="button"
              key={g.user_id}
              onClick={() => toggle(g.user_id)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                isSelected
                  ? 'border-secondary bg-secondary/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                readOnly
                checked={isSelected}
                className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {g.full_name ?? g.phone ?? 'Unknown'}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {g.relationship}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {maxSelections && (
        <p className="text-[11px] text-gray-500">
          {selected.length} / {maxSelections} selected
        </p>
      )}
    </div>
  )
}
