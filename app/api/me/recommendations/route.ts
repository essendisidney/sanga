import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleError, UnauthorizedError, ValidationError } from '@/lib/errors/handlers'

/**
 * GET /api/me/recommendations
 *   Returns non-dismissed, non-expired recommendations for the caller, ordered
 *   by priority. If no rows exist yet, returns a derived set from the member's
 *   actual state (real numbers, not fake data):
 *     - if no savings: "Open your first deposit"
 *     - if savings < 5k: "Build to KES 5,000 to unlock instant loans"
 *     - if credit score >= 700: "You qualify for no-guarantor loans"
 *     - if active loan: "Unlock up to X% of your savings"
 *
 * PATCH /api/me/recommendations
 *   Body: { id: string, dismissed: boolean }
 *   Dismisses a recommendation for the caller.
 */

export async function GET(_request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data: stored } = await supabase
      .from('personalized_recommendations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_dismissed', false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('priority', { ascending: true })
      .limit(10)

    if (stored && stored.length > 0) {
      return NextResponse.json({ recommendations: stored, derived: false })
    }

    // Derive recommendations from real member state
    const { data: persona } = await supabase
      .from('user_personas')
      .select('persona_type, risk_tolerance')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    const { data: savings } = membership
      ? await supabase
          .from('member_accounts')
          .select('balance')
          .eq('sacco_membership_id', membership.id)
          .eq('account_type', 'savings')
          .maybeSingle()
      : { data: null }

    const { data: creditRow } = await supabase
      .from('credit_scores')
      .select('score')
      .eq('user_id', user.id)
      .order('last_calculated', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: activeLoan } = membership
      ? await supabase
          .from('member_accounts')
          .select('id, balance')
          .eq('sacco_membership_id', membership.id)
          .eq('account_type', 'loan')
          .gt('balance', 0)
          .maybeSingle()
      : { data: null }

    const savingsBalance = Number(savings?.balance ?? 0)
    const creditScore = Number(creditRow?.score ?? 0)

    const derived: Array<{
      id: string
      recommendation_type: string
      title: string
      description: string
      action_url: string | null
      action_label: string | null
      icon: string
      color_class: string
      priority: number
      is_dismissed: boolean
    }> = []

    if (savingsBalance === 0) {
      derived.push({
        id: 'derived-first-deposit',
        recommendation_type: 'challenge',
        title: 'Make your first deposit',
        description: 'Even KES 100 starts your SANGA journey and unlocks member benefits.',
        action_url: '/deposit',
        action_label: 'Deposit now',
        icon: 'Target',
        color_class: 'from-green-500 to-emerald-500',
        priority: 1,
        is_dismissed: false,
      })
    } else if (savingsBalance < 5000) {
      derived.push({
        id: 'derived-build-savings',
        recommendation_type: 'challenge',
        title: `Grow to KES 5,000`,
        description: `You have KES ${savingsBalance.toLocaleString()} — KES ${(5000 - savingsBalance).toLocaleString()} more unlocks instant loans up to 2× your savings.`,
        action_url: '/deposit',
        action_label: 'Top up',
        icon: 'TrendingUp',
        color_class: 'from-blue-500 to-cyan-500',
        priority: 1,
        is_dismissed: false,
      })
    }

    if (creditScore >= 700) {
      derived.push({
        id: 'derived-no-guarantor',
        recommendation_type: 'product',
        title: 'You qualify for no-guarantor loans',
        description: `Credit score ${creditScore} means you can borrow without tracking down guarantors.`,
        action_url: '/loans/instant',
        action_label: 'Apply instantly',
        icon: 'Zap',
        color_class: 'from-purple-500 to-pink-500',
        priority: 2,
        is_dismissed: false,
      })
    }

    if (activeLoan && savingsBalance > 0) {
      derived.push({
        id: 'derived-partial-release',
        recommendation_type: 'product',
        title: 'Unlock your savings',
        description: `You have a loan AND KES ${savingsBalance.toLocaleString()} in savings. Up to 50% is releasable.`,
        action_url: '/loans/partial-release',
        action_label: 'Request release',
        icon: 'Unlock',
        color_class: 'from-amber-500 to-orange-500',
        priority: 3,
        is_dismissed: false,
      })
    }

    derived.push({
      id: 'derived-tip',
      recommendation_type: 'tip',
      title: 'Tip of the day',
      description: 'Consistent small deposits build your credit score faster than occasional large ones.',
      action_url: null,
      action_label: null,
      icon: 'BookOpen',
      color_class: 'from-slate-500 to-gray-600',
      priority: 9,
      is_dismissed: false,
    })

    return NextResponse.json({
      recommendations: derived,
      derived: true,
      persona: persona ?? null,
    })
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; dismissed?: boolean }
    const { id, dismissed } = body

    if (!id) throw new ValidationError('id required')
    // Derived recommendations can't be persisted — they're re-derived each call
    if (id.startsWith('derived-')) {
      return NextResponse.json({ success: true, note: 'derived recommendations cannot be dismissed' })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { error } = await supabase
      .from('personalized_recommendations')
      .update({
        is_dismissed: dismissed ?? true,
        dismissed_at: dismissed ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
