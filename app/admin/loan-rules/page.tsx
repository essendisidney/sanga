'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Plus,
  Power,
  Pencil,
  Trash2,
  ShieldOff,
  ShieldCheck,
} from 'lucide-react'

/**
 * /admin/loan-rules — manage age-based loan rules (loan_rules_by_age).
 *
 * Regulatory warning is non-dismissable on purpose: whoever is editing
 * this table is making policy decisions that can trigger discrimination
 * audits. The master kill-switch flips every row's is_active flag in
 * one request, which is how we recover cleanly if compliance objects.
 */

type Rule = {
  id: string
  sacco_id: string | null
  age_min: number
  age_max: number
  requires_guarantors: boolean
  min_guarantors: number
  max_instant_loan: number
  interest_rate: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

const EMPTY_RULE = {
  age_min: 18,
  age_max: 35,
  requires_guarantors: false,
  min_guarantors: 0,
  max_instant_loan: 50000,
  interest_rate: 12,
  is_active: true,
  notes: '',
}

export default function LoanRulesAdminPage() {
  const router = useRouter()
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState<null | Partial<Rule>>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/loan-rules', { cache: 'no-store' })
      if (res.status === 401) {
        router.replace('/login')
        return
      }
      if (res.status === 403) {
        toast.error('Admin access required')
        router.replace('/dashboard')
        return
      }
      const data = await res.json()
      setRules(data.rules ?? [])
    } catch (err) {
      toast.error('Failed to load loan rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleKillSwitch = async (active: boolean) => {
    const prompt = active
      ? 'Re-activate ALL loan rules by age?\n\nThis will restart age-based loan decisions across every row.'
      : 'DISABLE ALL age-based loan rules?\n\nAfter this, get_applicable_loan_rule returns nothing and loan decisions fall back to the risk-based engine. Use this if compliance flags age discrimination.'
    if (!confirm(prompt)) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/loan-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_all_active: active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed')
      toast.success(
        active
          ? `Re-activated ${data.updated} rule(s)`
          : `Disabled ${data.updated} rule(s)`,
      )
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (rule: Partial<Rule>) => {
    setSaving(true)
    try {
      const isCreate = !rule.id
      const url = isCreate
        ? '/api/admin/loan-rules'
        : `/api/admin/loan-rules/${rule.id}`
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      toast.success(isCreate ? 'Rule created' : 'Rule updated')
      setEditOpen(null)
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hard-delete this rule? Use "disable" instead unless this is a test row.')) {
      return
    }
    try {
      const res = await fetch(`/api/admin/loan-rules/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Delete failed')
      }
      toast.success('Rule deleted')
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Delete failed')
    }
  }

  const activeCount = rules.filter((r) => r.is_active).length

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-primary">
            Age-Based Loan Rules
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} active · {rules.length - activeCount} disabled
          </p>
        </div>
        <div className="flex gap-2">
          {activeCount > 0 ? (
            <button
              onClick={() => handleKillSwitch(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <ShieldOff className="h-4 w-4" />
              Kill switch
            </button>
          ) : (
            <button
              onClick={() => handleKillSwitch(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Re-activate all
            </button>
          )}
          <button
            onClick={() => setEditOpen(EMPTY_RULE)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            New band
          </button>
        </div>
      </div>

      {/* Regulatory warning — non-dismissable */}
      <div className="rounded-xl border border-red-300 bg-red-50 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-700 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-semibold">Regulatory warning — age-based lending</p>
            <p className="mt-1 text-red-800">
              Differentiating loan terms by age may constitute prohibited
              discrimination in Kenya (Consumer Protection Act 2012) and
              most other jurisdictions. Edits here directly influence the
              loan-decision engine via <code className="rounded bg-white/50 px-1">get_applicable_loan_rule()</code>.
              If compliance flags this feature, use the <strong>Kill switch</strong>{' '}
              to disable every row in a single request; the instant-loan
              engine falls back to risk-based scoring.
            </p>
          </div>
        </div>
      </div>

      {/* Rules table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Scope
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Age range
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Guarantors
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Max instant loan
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Rate
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      No rules defined
                    </td>
                  </tr>
                ) : (
                  rules.map((r) => (
                    <tr key={r.id} className={`transition hover:bg-gray-50/50 ${!r.is_active ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-sm">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.sacco_id ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                          {r.sacco_id ? 'Sacco' : 'Global'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {r.age_min} – {r.age_max}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {r.requires_guarantors
                          ? `≥ ${r.min_guarantors}`
                          : 'None'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        KES {Number(r.max_instant_loan).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {Number(r.interest_rate).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            handleSave({ id: r.id, is_active: !r.is_active })
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${r.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          <Power className="h-3 w-3" />
                          {r.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditOpen(r)}
                            aria-label="Edit"
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            aria-label="Delete"
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      <AnimatePresence>
        {editOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => !saving && setEditOpen(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                {editOpen.id ? 'Edit rule' : 'New rule'}
              </h2>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSave(editOpen)
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Age min</span>
                    <input
                      type="number"
                      min={0}
                      max={150}
                      value={editOpen.age_min ?? 18}
                      onChange={(e) =>
                        setEditOpen({ ...editOpen, age_min: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Age max</span>
                    <input
                      type="number"
                      min={0}
                      max={150}
                      value={editOpen.age_max ?? 35}
                      onChange={(e) =>
                        setEditOpen({ ...editOpen, age_max: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(editOpen.requires_guarantors)}
                    onChange={(e) =>
                      setEditOpen({
                        ...editOpen,
                        requires_guarantors: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary"
                  />
                  Requires guarantors
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-700">
                    Minimum guarantors
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    disabled={!editOpen.requires_guarantors}
                    value={editOpen.min_guarantors ?? 0}
                    onChange={(e) =>
                      setEditOpen({
                        ...editOpen,
                        min_guarantors: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary disabled:bg-gray-50"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-700">
                    Max instant loan (KES)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={editOpen.max_instant_loan ?? 0}
                    onChange={(e) =>
                      setEditOpen({
                        ...editOpen,
                        max_instant_loan: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-700">
                    Interest rate (%)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.25}
                    value={editOpen.interest_rate ?? 0}
                    onChange={(e) =>
                      setEditOpen({
                        ...editOpen,
                        interest_rate: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-700">
                    Notes (compliance rationale)
                  </span>
                  <textarea
                    rows={2}
                    value={editOpen.notes ?? ''}
                    onChange={(e) =>
                      setEditOpen({ ...editOpen, notes: e.target.value })
                    }
                    placeholder="Justification for this age band"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(editOpen.is_active ?? true)}
                    onChange={(e) =>
                      setEditOpen({ ...editOpen, is_active: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary"
                  />
                  Active
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(null)}
                    disabled={saving}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : editOpen.id ? 'Save changes' : 'Create rule'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
