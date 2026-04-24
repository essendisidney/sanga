import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, AuditAction } from '@/lib/audit'
import { handleError, UnauthorizedError, ValidationError } from '@/lib/errors/handlers'

/**
 * GET /api/loans/partial-release
 *   Returns the caller's current eligibility (max releasable amount + reasons)
 *   and their recent partial release history.
 *
 * POST /api/loans/partial-release
 *   Body: { amount: number, loanId?: string, reason?: string }
 *   Opens a new pending partial-release request via the request_partial_release
 *   RPC. Eligibility is validated server-side; the RPC is the single source of
 *   truth for "how much can this member actually take out right now".
 */

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data: eligibility } = await supabase.rpc(
      'check_partial_release_eligibility',
      { p_user_id: user.id, p_requested_amount: null },
    )

    const { data: history } = await supabase
      .from('partial_releases')
      .select('id, requested_amount, released_amount, status, created_at, approved_at, rejected_at, rejection_reason')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      eligibility: eligibility ?? null,
      history: history ?? [],
    })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount?: number
      loanId?: string
      reason?: string
    }

    const { amount, loanId, reason } = body

    if (!amount || amount <= 0) {
      throw new ValidationError('amount (> 0) required')
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data: result, error } = await supabase.rpc('request_partial_release', {
      p_user_id: user.id,
      p_amount: amount,
      p_loan_application_id: loanId ?? null,
      p_reason: reason ?? null,
    })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const payload = result as
      | { success: true; release_id: string; eligibility: Record<string, unknown> }
      | { success: false; reason: string; eligibility?: Record<string, unknown> }

    if (!payload?.success) {
      return NextResponse.json(
        { success: false, error: payload?.reason ?? 'Not eligible', eligibility: payload?.eligibility },
        { status: 400 },
      )
    }

    logAudit(
      user.id,
      AuditAction.TRANSACTION,
      {
        entityType: 'partial_release',
        entityId: payload.release_id,
        newValues: { amount, loanId: loanId ?? null, reason: reason ?? null },
        status: 'success',
      },
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined,
    ).catch((e) => console.error('audit log failed:', e))

    return NextResponse.json({
      success: true,
      releaseId: payload.release_id,
      eligibility: payload.eligibility,
      message: 'Partial release request submitted. An admin will review it shortly.',
    })
  } catch (error) {
    return handleError(error)
  }
}
