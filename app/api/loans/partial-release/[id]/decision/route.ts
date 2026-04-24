import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'

/**
 * POST /api/loans/partial-release/[id]/decision
 *   Admin-only. Body: { decision: 'approve' | 'reject', reason?: string }
 *   Calls approve_partial_release or reject_partial_release RPC atomically.
 *   Disbursement + savings debit + transaction row all happen inside the RPC
 *   so we can never end up half-committed.
 */
export async function POST(request: Request, context: any) {
  const params = await context?.params
  const releaseId = params?.id as string | undefined

  if (!releaseId) {
    return NextResponse.json({ error: 'release id required' }, { status: 400 })
  }

  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user, role } = auth

  const body = (await request.json()) as {
    decision?: 'approve' | 'reject'
    reason?: string
  }
  const { decision, reason } = body

  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json(
      { error: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    )
  }

  const rpcName = decision === 'approve' ? 'approve_partial_release' : 'reject_partial_release'
  const rpcArgs =
    decision === 'approve'
      ? { p_release_id: releaseId, p_approver_id: user.id }
      : { p_release_id: releaseId, p_approver_id: user.id, p_reason: reason ?? 'No reason provided' }

  const { data: result, error } = await supabase.rpc(rpcName, rpcArgs)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const payload = result as { success: boolean; reason?: string; [k: string]: unknown }

  if (!payload?.success) {
    return NextResponse.json(
      { success: false, error: payload?.reason ?? 'Decision failed' },
      { status: 400 },
    )
  }

  logAudit(
    user.id,
    decision === 'approve' ? AuditAction.APPROVAL_GRANTED : AuditAction.APPROVAL_REJECTED,
    {
      entityType: 'partial_release',
      entityId: releaseId,
      newValues: payload,
      userRole: role,
      status: 'success',
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  const { success: _success, ...rest } = payload
  return NextResponse.json({ success: true, ...rest })
}
