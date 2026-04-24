'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import BottomNav from '@/components/BottomNav'
import {
  ArrowLeft,
  Users,
  UserPlus,
  Check,
  X,
  Eye,
  ShieldCheck,
  Trash2,
  Clock,
  Inbox,
  SendHorizonal,
} from 'lucide-react'

/**
 * /family — manage consented family links.
 *
 * Three lanes:
 *   - Accepted: people you're linked with, with their permission flags
 *   - Pending (incoming): requests waiting on YOU to accept/decline
 *   - Pending (outgoing): requests YOU sent waiting on the other party
 *
 * Every permission (guarantee, view balance) is opt-in per-side, so
 * Accepting someone's invitation does NOT grant you blanket access to
 * their balance — only the flags they set on the invite apply.
 */

type Direction = 'outgoing' | 'incoming'

type Link = {
  id: string
  direction: Direction
  relationship: string
  can_guarantee: boolean
  can_view_balance: boolean
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  invited_at: string
  responded_at: string | null
  revoked_at: string | null
  other_user: { id: string; full_name: string | null; phone: string | null } | null
}

const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'dependant', label: 'Dependant' },
]

function labelFor(value: string): string {
  return RELATIONSHIPS.find((r) => r.value === value)?.label ?? value
}

export default function FamilyPage() {
  const router = useRouter()
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Invite form state
  const [identifier, setIdentifier] = useState('')
  const [relationship, setRelationship] = useState('parent')
  const [canGuarantee, setCanGuarantee] = useState(false)
  const [canViewBalance, setCanViewBalance] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/family-links', { cache: 'no-store' })
      if (res.status === 401) {
        router.replace('/login')
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load')
      setLinks(data.links ?? [])
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to load family links')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  const resetInvite = () => {
    setIdentifier('')
    setRelationship('parent')
    setCanGuarantee(false)
    setCanViewBalance(false)
  }

  const handleInvite = async () => {
    if (!identifier.trim()) {
      toast.error('Enter a phone number, email, or member number')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/me/family-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          relationship,
          can_guarantee: canGuarantee,
          can_view_balance: canViewBalance,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to send invite')
      toast.success('Invite sent')
      setInviteOpen(false)
      resetInvite()
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not send invite')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRespond = async (id: string, accept: boolean) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/me/family-links/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed')
      toast.success(accept ? 'Link accepted' : 'Link declined')
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to respond')
    } finally {
      setBusy(null)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this family link? Permissions will be removed immediately.')) {
      return
    }
    setBusy(id)
    try {
      const res = await fetch(`/api/me/family-links/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Failed to revoke')
      }
      toast.success('Link revoked')
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not revoke link')
    } finally {
      setBusy(null)
    }
  }

  const accepted = links.filter((l) => l.status === 'accepted')
  const incoming = links.filter((l) => l.status === 'pending' && l.direction === 'incoming')
  const outgoing = links.filter((l) => l.status === 'pending' && l.direction === 'outgoing')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pb-24">
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="rounded-full p-2 transition hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">Family</h1>
            <p className="text-xs text-gray-500">
              Linked members can guarantee loans · opt-in only
            </p>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
          >
            <UserPlus className="h-4 w-4" />
            Invite
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-5 sm:px-6">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-20 rounded-2xl" />
            <div className="skeleton h-20 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Incoming invites: make them impossible to miss */}
            {incoming.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-gray-900">
                    Invitations to review ({incoming.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {incoming.map((link) => (
                    <motion.div
                      key={link.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="card-luxury p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                          <Users className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">
                            {link.other_user?.full_name ?? 'Unknown member'}
                          </p>
                          <p className="text-xs text-gray-500">
                            wants to link as your{' '}
                            <strong>{labelFor(link.relationship).toLowerCase()}</strong>
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {link.can_guarantee && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                                <ShieldCheck className="h-3 w-3" />
                                May guarantee your loans
                              </span>
                            )}
                            {link.can_view_balance && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-800">
                                <Eye className="h-3 w-3" />
                                May view your balance
                              </span>
                            )}
                            {!link.can_guarantee && !link.can_view_balance && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                No special permissions
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleRespond(link.id, true)}
                              disabled={busy === link.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Accept
                            </button>
                            <button
                              onClick={() => handleRespond(link.id, false)}
                              disabled={busy === link.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-300 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Accepted links */}
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">
                Linked family ({accepted.length})
              </h2>
              {accepted.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
                  <Users className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-700">
                    No family linked yet
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Invite a parent, spouse, or sibling to guarantee loans or view balance with consent.
                  </p>
                  <button
                    onClick={() => setInviteOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
                  >
                    <UserPlus className="h-4 w-4" />
                    Send an invite
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {accepted.map((link) => (
                    <div
                      key={link.id}
                      className="card-luxury flex items-center gap-3 p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {link.other_user?.full_name ?? 'Unknown member'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {labelFor(link.relationship)}
                          {link.direction === 'incoming' && ' · they linked you'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {link.can_guarantee && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              <ShieldCheck className="h-3 w-3" />
                              Guarantor
                            </span>
                          )}
                          {link.can_view_balance && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                              <Eye className="h-3 w-3" />
                              Balance visible
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {link.can_view_balance && link.direction === 'incoming' && link.other_user && (
                          <button
                            onClick={() =>
                              router.push(`/family/${link.other_user!.id}/balance`)
                            }
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                          >
                            View balance
                          </button>
                        )}
                        <button
                          onClick={() => handleRevoke(link.id)}
                          disabled={busy === link.id}
                          aria-label="Revoke link"
                          className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Outgoing pending */}
            {outgoing.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <SendHorizonal className="h-4 w-4 text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-900">
                    Waiting for response ({outgoing.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {outgoing.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <Clock className="h-5 w-5 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {link.other_user?.full_name ?? link.other_user?.phone ?? 'Invited member'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {labelFor(link.relationship)} · invited{' '}
                          {new Date(link.invited_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevoke(link.id)}
                        disabled={busy === link.id}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Invite modal */}
      <AnimatePresence>
        {inviteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => !submitting && setInviteOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-gray-900">Invite family member</h2>
              <p className="mt-1 text-xs text-gray-500">
                They'll see the invite next time they open SANGA. No permission is
                granted until they accept.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Phone, email, or member number
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="+254722000000"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Relationship
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-700">
                    Permissions to request
                  </p>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={canGuarantee}
                      onChange={(e) => setCanGuarantee(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary"
                    />
                    <span>
                      <strong className="text-gray-900">Can guarantee my loans</strong>
                      <br />
                      <span className="text-gray-500">
                        They'll be auto-suggested as a guarantor when I apply for a loan.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={canViewBalance}
                      onChange={(e) => setCanViewBalance(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary"
                    />
                    <span>
                      <strong className="text-gray-900">Can view my balance</strong>
                      <br />
                      <span className="text-gray-500">
                        They can see my savings/loan totals (not transaction history).
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setInviteOpen(false)}
                  disabled={submitting}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={submitting || !identifier.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  )
}
