import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, AuditAction } from '@/lib/audit'
import { handleError, UnauthorizedError, ValidationError } from '@/lib/errors/handlers'

/**
 * GET /api/loans/instant
 *   Returns the caller's instant-loan eligibility (max amount, reason codes,
 *   inputs used). The same logic the RPC uses is re-run read-only so the UI
 *   can show a limit before the user taps "Apply".
 *
 * POST /api/loans/instant
 *   Body: { amount: number, purpose?: string, durationDays?: number }
 *   Calls the process_instant_loan RPC which atomically:
 *     - validates eligibility
 *     - picks a no-guarantor loan_product
 *     - creates loan_application (status=disbursed)
 *     - generates repayment schedule
 *     - credits savings account
 *     - writes the disbursement transaction
 *   If ineligible, returns { approved: false, reason, ... } with HTTP 400.
 */

export async function GET(_request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    // Gather the inputs the RPC uses so the UI can show a preview
    const { data: membership } = await supabase
      .from('sacco_memberships')
      .select('id, sacco_id, status, joined_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ eligible: false, reason: 'No active SACCO membership', max_amount: 0 })
    }

    const { data: savings } = await supabase
      .from('member_accounts')
      .select('id, balance')
      .eq('sacco_membership_id', membership.id)
      .eq('account_type', 'savings')
      .maybeSingle()

    const { data: creditRow } = await supabase
      .from('credit_scores')
      .select('score, last_calculated')
      .eq('user_id', user.id)
      .order('last_calculated', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { count: activeLoans } = await supabase
      .from('loan_applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['approved', 'disbursed'])

    const { count: anyLoan } = await supabase
      .from('loan_applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const creditScore = Number(creditRow?.score ?? 500)
    const savingsBalance = Number(savings?.balance ?? 0)
    const firstLoan = (anyLoan ?? 0) === 0

    let maxAmount = 0
    let reason: string | null = null
    if ((activeLoans ?? 0) >= 3) {
      reason = 'Too many active loans (max 3 for instant approval)'
    } else if (creditScore >= 700) {
      maxAmount = 100000
    } else if (creditScore >= 500 && savingsBalance >= 5000) {
      maxAmount = Math.min(savingsBalance * 2, 50000)
    } else if (firstLoan && savingsBalance >= 1000) {
      maxAmount = 10000
    } else {
      reason = 'Build savings of at least KES 1,000 or a credit score of 500+ to qualify'
    }

    return NextResponse.json({
      eligible: maxAmount > 0,
      max_amount: maxAmount,
      reason,
      credit_score: creditScore,
      savings_balance: savingsBalance,
      active_loans: activeLoans ?? 0,
      first_loan: firstLoan,
    })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount?: number
      purpose?: string
      durationDays?: number
    }

    const { amount, purpose, durationDays } = body

    if (!amount || amount <= 0) {
      throw new ValidationError('amount (> 0) required')
    }
    if (amount > 100000) {
      throw new ValidationError('Instant loans are capped at KES 100,000')
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data: result, error } = await supabase.rpc('process_instant_loan', {
      p_user_id: user.id,
      p_amount: amount,
      p_purpose: purpose ?? 'Instant loan',
      p_duration_days: durationDays ?? 30,
    })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const payload = result as {
      approved: boolean
      reason?: string
      [k: string]: unknown
    }

    if (!payload?.approved) {
      const { approved: _approved, reason: _reason, ...rest } = payload ?? {}
      return NextResponse.json(
        { success: false, approved: false, error: payload?.reason ?? 'Not approved', ...rest },
        { status: 400 },
      )
    }

    logAudit(
      user.id,
      AuditAction.LOAN_DISBURSE,
      {
        entityType: 'loan_application',
        entityId: String(payload.loan_id ?? ''),
        newValues: { amount, purpose, durationDays, instant: true },
        status: 'success',
      },
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined,
    ).catch((e) => console.error('audit log failed:', e))

    return NextResponse.json({ success: true, ...payload })
  } catch (error) {
    return handleError(error)
  }
}
