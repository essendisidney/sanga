import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleError, UnauthorizedError } from '@/lib/errors/handlers'

/**
 * GET /api/challenges
 *
 * Lists active savings challenges, annotated with:
 *   - my_participation (null if not enrolled)
 *   - pool_total / participant_count (for group_pool challenges)
 *
 * Only challenges that are active and not past ends_at are returned.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const [{ data: challenges, error }, { data: mine }] = await Promise.all([
      supabase
        .from('savings_challenges_with_totals')
        .select('*')
        .eq('is_active', true)
        .gt('ends_at', new Date().toISOString())
        .order('ends_at', { ascending: true }),
      supabase
        .from('challenge_participants')
        .select(
          'id, challenge_id, status, progress_amount, progress_deposits, progress_streak, progress_pct, enrolled_at, completed_at, last_progress_at',
        )
        .eq('user_id', user.id),
    ])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const byChallenge = new Map<string, any>()
    for (const row of mine ?? []) {
      byChallenge.set(row.challenge_id, row)
    }

    const rows = (challenges ?? []).map((c: any) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      description: c.description,
      rule_type: c.rule_type,
      target_amount: c.target_amount != null ? Number(c.target_amount) : null,
      deposits_required: c.deposits_required,
      window_days: c.window_days,
      pool_target: c.pool_target != null ? Number(c.pool_target) : null,
      reward_description: c.reward_description,
      reward_amount: Number(c.reward_amount ?? 0),
      ends_at: c.ends_at,
      icon: c.icon,
      color_class: c.color_class,
      is_auto_enroll: c.is_auto_enroll,
      pool_total: Number(c.pool_total ?? 0),
      participant_count: Number(c.participant_count ?? 0),
      my_participation: byChallenge.get(c.id) ?? null,
    }))

    return NextResponse.json({ challenges: rows })
  } catch (error) {
    return handleError(error)
  }
}
