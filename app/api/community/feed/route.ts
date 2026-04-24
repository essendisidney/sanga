import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleError, UnauthorizedError } from '@/lib/errors/handlers'

/**
 * GET /api/community/feed
 *
 * Returns aggregated, anonymized community activity — REAL DATA, no invented
 * users. Specifically we return:
 *
 *   {
 *     stats: {
 *       deposits_today: number,
 *       deposits_amount_today: number,
 *       new_loans_this_week: number,
 *       new_members_this_month: number,
 *       active_members: number,
 *       total_savings: number,
 *     },
 *     milestones: [
 *       { kind: 'deposit_streak' | 'loan_repaid' | 'first_deposit',
 *         initial: string,   // "J.M." — first-letter anonymized
 *         time_ago: string }
 *     ],
 *     tips: [ { title, description } ]   // static admin-curated financial tips
 *   }
 *
 * Every number comes from a real query. No fabricated testimonials; the
 * "milestones" list uses real recent events, anonymized to initials so it
 * can't be traced back to a specific member.
 */
export async function GET(_request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('sacco_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const saccoId = membership?.sacco_id ?? null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const depositsTodayQuery = supabase
      .from('transactions')
      .select('id, amount', { count: 'exact' })
      .eq('type', 'deposit')
      .gte('created_at', today.toISOString())

    const newLoansQuery = supabase
      .from('loan_applications')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())

    const newMembersQuery = supabase
      .from('sacco_memberships')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthAgo.toISOString())

    const activeMembersQuery = supabase
      .from('sacco_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    if (saccoId) {
      depositsTodayQuery.eq('sacco_id', saccoId)
      newLoansQuery.eq('sacco_id', saccoId)
      newMembersQuery.eq('sacco_id', saccoId)
      activeMembersQuery.eq('sacco_id', saccoId)
    }

    const [depositsToday, newLoans, newMembers, activeMembers] = await Promise.all([
      depositsTodayQuery,
      newLoansQuery,
      newMembersQuery,
      activeMembersQuery,
    ])

    const depositsAmountToday = (depositsToday.data ?? []).reduce(
      (sum, row: any) => sum + Number(row?.amount ?? 0),
      0,
    )

    // Total savings: sum of all savings account balances in this sacco
    const savingsQuery = supabase
      .from('member_accounts')
      .select('balance, sacco_memberships!inner(sacco_id)')
      .eq('account_type', 'savings')
    if (saccoId) savingsQuery.eq('sacco_memberships.sacco_id', saccoId)
    const { data: savingsRows } = await savingsQuery
    const totalSavings = (savingsRows ?? []).reduce(
      (sum, r: any) => sum + Number(r?.balance ?? 0),
      0,
    )

    // Recent anonymized milestones (last 7 days)
    const milestones: Array<{ kind: string; initial: string; time_ago: string; amount?: number }> = []

    const recentLargeDeposits = await supabase
      .from('transactions')
      .select('amount, created_at, users(full_name)')
      .eq('type', 'deposit')
      .gte('created_at', weekAgo.toISOString())
      .gte('amount', 1000)
      .order('amount', { ascending: false })
      .limit(5)

    for (const row of recentLargeDeposits.data ?? []) {
      const name = (row as any)?.users?.full_name as string | undefined
      const initial = anonymizeName(name)
      milestones.push({
        kind: 'deposit',
        initial,
        time_ago: timeAgo(new Date((row as any).created_at)),
        amount: Number((row as any).amount ?? 0),
      })
    }

    const recentRepaidLoans = await supabase
      .from('loan_applications')
      .select('amount, updated_at, users(full_name)')
      .eq('status', 'completed')
      .gte('updated_at', monthAgo.toISOString())
      .order('updated_at', { ascending: false })
      .limit(3)

    for (const row of recentRepaidLoans.data ?? []) {
      const name = (row as any)?.users?.full_name as string | undefined
      const initial = anonymizeName(name)
      milestones.push({
        kind: 'loan_repaid',
        initial,
        time_ago: timeAgo(new Date((row as any).updated_at)),
        amount: Number((row as any).amount ?? 0),
      })
    }

    const tips = [
      {
        title: 'The 50/30/20 rule',
        description:
          '50% needs, 30% wants, 20% savings. Keep to this and you\'ll never wonder where your money went.',
      },
      {
        title: 'Emergency fund first',
        description:
          'Before investing or taking a loan, aim for 3 months of expenses in savings. SANGA is a great place to start.',
      },
      {
        title: 'Avoid loan stacking',
        description:
          'Multiple active loans compound quickly. Finish one before taking the next.',
      },
    ]

    return NextResponse.json({
      stats: {
        deposits_today: depositsToday.count ?? 0,
        deposits_amount_today: depositsAmountToday,
        new_loans_this_week: newLoans.count ?? 0,
        new_members_this_month: newMembers.count ?? 0,
        active_members: activeMembers.count ?? 0,
        total_savings: totalSavings,
      },
      milestones,
      tips,
    })
  } catch (error) {
    return handleError(error)
  }
}

function anonymizeName(name?: string): string {
  if (!name) return 'A member'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A member'
  if (parts.length === 1) return parts[0][0].toUpperCase() + '.'
  return parts[0][0].toUpperCase() + '.' + parts[parts.length - 1][0].toUpperCase() + '.'
}

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
