import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleError, UnauthorizedError } from '@/lib/errors/handlers'

/**
 * GET /api/me/credit-score
 *
 * Returns the caller's social credit score + the loan amount they qualify for
 * without guarantors. Lazily creates the row via ensure_social_credit_score
 * if they don't have one yet.
 *
 * Response:
 *   {
 *     score: number,               // 300-850, for the UI dial
 *     band: 'excellent' | 'good' | 'fair' | 'building',
 *     loan_without_guarantors: number,
 *     breakdown: { ... sub-scores ... }
 *   }
 */
export async function GET(_request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data: ensured, error: ensureErr } = await supabase.rpc(
      'ensure_social_credit_score',
      { p_user_id: user.id },
    )

    if (ensureErr) {
      return NextResponse.json({ error: ensureErr.message }, { status: 500 })
    }

    const row =
      (Array.isArray(ensured) ? ensured[0] : ensured) as
        | {
            final_score: number
            base_score: number
            savings_consistency_score: number
            transaction_frequency_score: number
            referral_score: number
            community_engagement_score: number
            bill_payment_history_score: number
            network_quality_score: number
            group_participation_score: number
            loan_eligibility_without_guarantors: number
          }
        | null

    if (!row) {
      return NextResponse.json(
        { score: 300, band: 'building', loan_without_guarantors: 0, breakdown: null },
      )
    }

    const score = row.final_score
    const band =
      score >= 750 ? 'excellent' : score >= 650 ? 'good' : score >= 500 ? 'fair' : 'building'

    return NextResponse.json({
      score,
      band,
      loan_without_guarantors: Number(row.loan_eligibility_without_guarantors ?? 0),
      breakdown: {
        base: row.base_score,
        savings_consistency: row.savings_consistency_score,
        transaction_frequency: row.transaction_frequency_score,
        bill_payment_history: row.bill_payment_history_score,
        community_engagement: row.community_engagement_score,
        referrals: row.referral_score,
        network_quality: row.network_quality_score,
        group_participation: row.group_participation_score,
      },
    })
  } catch (error) {
    return handleError(error)
  }
}
