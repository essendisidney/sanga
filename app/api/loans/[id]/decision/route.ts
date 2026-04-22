import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, AuditAction } from '@/lib/audit'
import { sendEmail, emailTemplates } from '@/lib/email/send'

export async function POST(
  request: Request,
  context: any
) {
  try {
    const params = await context?.params
    const body = (await request.json()) as {
      decision?: 'approve' | 'reject' | string
      notes?: string
    }

    const { decision, notes = '' } = body

    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { error: 'decision must be approve|reject' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updateData: any = {
      status: decision === 'approve' ? 'approved' : 'rejected',
      [`${decision === 'approve' ? 'approved_by' : 'rejected_by'}`]: user.id,
      [`${decision === 'approve' ? 'approved_at' : 'rejected_at'}`]:
        new Date().toISOString(),
      loan_officer_notes: notes,
    }

    const { data, error } = await supabase
      .from('loan_applications')
      .update(updateData)
      .eq('id', params?.id)
      .select(`
        *,
        users ( full_name, email ),
        loan_products ( name, interest_rate )
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logAudit(
      user.id,
      AuditAction.LOAN_APPROVE,
      {
        loan_id: params?.id,
        decision,
        notes,
      },
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined,
    ).catch((e) => console.error('audit log failed:', e))

    const borrower = (data as any)?.users
    const product = (data as any)?.loan_products
    if (borrower?.email) {
      if (decision === 'approve') {
        const principal = Number(data?.amount || 0)
        const rate = Number(product?.interest_rate || 0)
        // Simple flat-rate total; real repayment is computed in the schedule
        // endpoint. We only need a friendly "total repayable" for the email.
        const totalRepayable = Math.round(principal * (1 + rate / 100))
        const tpl = emailTemplates.loanApproved(borrower.full_name || 'Member', principal, totalRepayable)
        sendEmail({ to: borrower.email, subject: tpl.subject, html: tpl.html, auditUserId: user.id })
          .catch((e) => console.error('loan_approved email failed:', e))
      } else {
        const tpl = emailTemplates.loanRejected(borrower.full_name || 'Member', notes || 'Not specified')
        sendEmail({ to: borrower.email, subject: tpl.subject, html: tpl.html, auditUserId: user.id })
          .catch((e) => console.error('loan_rejected email failed:', e))
      }
    }

    return NextResponse.json({ success: true, application: data })
  } catch {
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 })
  }
}
