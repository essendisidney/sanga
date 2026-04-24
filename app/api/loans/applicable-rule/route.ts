import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleError, UnauthorizedError } from '@/lib/errors/handlers'

/**
 * GET /api/loans/applicable-rule
 *
 * Returns the age-bracketed loan rule that applies to the caller, plus
 * a fallback flag so the UI knows when to defer to the risk-based
 * engine (instant_loan_rules + social credit score).
 *
 * REGULATORY NOTE: age-based loan differentiation is a known compliance
 * risk. This endpoint surfaces the data that the admin-configured
 * loan_rules_by_age table implies; the decision to *enforce* that data
 * in a production loan flow is a product / compliance call. The actual
 * disbursement RPCs still gate on social_credit_score.
 *
 * Response:
 *   {
 *     has_rule: boolean,
 *     rule: {
 *       rule_id, sacco_id, source: 'global' | 'sacco',
 *       age_min, age_max, user_age,
 *       requires_guarantors, min_guarantors,
 *       max_instant_loan, interest_rate,
 *     } | null,
 *     reason?: 'missing_dob' | 'no_bracket'
 *   }
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const url = new URL(request.url)
    const saccoIdParam = url.searchParams.get('sacco_id')

    // If no sacco_id was passed, pick the caller's primary membership
    // so sacco-specific rules can win over the global default.
    let saccoId: string | null = saccoIdParam
    if (!saccoId) {
      const { data: membership } = await supabase
        .from('sacco_memberships')
        .select('sacco_id')
        .eq('user_id', user.id)
        .maybeSingle()
      saccoId = membership?.sacco_id ?? null
    }

    const { data, error } = await supabase.rpc('get_applicable_loan_rule', {
      p_user_id: user.id,
      p_sacco_id: saccoId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      // Distinguish "we couldn't compute your age" from "your age isn't
      // in any configured band" so the UI can tell the user what to do.
      const { data: userRow } = await supabase
        .from('users')
        .select('date_of_birth')
        .eq('id', user.id)
        .maybeSingle()

      return NextResponse.json({
        has_rule: false,
        rule: null,
        reason: userRow?.date_of_birth ? 'no_bracket' : 'missing_dob',
      })
    }

    return NextResponse.json({
      has_rule: true,
      rule: {
        rule_id: row.rule_id,
        sacco_id: row.sacco_id,
        source: row.source,
        age_min: row.age_min,
        age_max: row.age_max,
        user_age: row.user_age,
        requires_guarantors: row.requires_guarantors,
        min_guarantors: row.min_guarantors,
        max_instant_loan: Number(row.max_instant_loan ?? 0),
        interest_rate: Number(row.interest_rate ?? 0),
      },
    })
  } catch (error) {
    return handleError(error)
  }
}
