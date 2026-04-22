import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit, AuditAction } from '@/lib/audit'
import { sendEmail, emailTemplates } from '@/lib/email/send'

export async function GET() {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const { data: loans } = await supabase
    .from('loan_applications')
    .select(`
      *,
      users (
        id,
        full_name,
        phone,
        email
      ),
      loan_products (
        name,
        interest_rate
      )
    `)
    .order('created_at', { ascending: false })

  return NextResponse.json(loans || [])
}

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase, user: actingAdmin } = auth

  const body = await request.json()
  const { id, status, notes } = body

  if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json(
      { error: 'id and status (approved|rejected|pending) required' },
      { status: 400 }
    )
  }

  const updateData: any = { status }
  if (status === 'approved') {
    updateData.approved_at = new Date().toISOString()
    updateData.approved_by = actingAdmin.id
  }
  if (status === 'rejected') {
    updateData.rejected_at = new Date().toISOString()
    updateData.rejected_by = actingAdmin.id
    updateData.rejection_reason = notes
  }

  const { data, error } = await supabase
    .from('loan_applications')
    .update(updateData)
    .eq('id', id)
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
    actingAdmin.id,
    AuditAction.LOAN_APPROVE,
    { loan_id: id, status, notes: notes ?? null },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  const borrower = (data as any)?.users
  const product = (data as any)?.loan_products
  if (borrower?.email && (status === 'approved' || status === 'rejected')) {
    if (status === 'approved') {
      const principal = Number((data as any)?.amount || 0)
      const rate = Number(product?.interest_rate || 0)
      const totalRepayable = Math.round(principal * (1 + rate / 100))
      const tpl = emailTemplates.loanApproved(borrower.full_name || 'Member', principal, totalRepayable)
      sendEmail({ to: borrower.email, subject: tpl.subject, html: tpl.html, auditUserId: actingAdmin.id })
        .catch((e) => console.error('loan_approved email failed:', e))
    } else {
      const tpl = emailTemplates.loanRejected(borrower.full_name || 'Member', notes || 'Not specified')
      sendEmail({ to: borrower.email, subject: tpl.subject, html: tpl.html, auditUserId: actingAdmin.id })
        .catch((e) => console.error('loan_rejected email failed:', e))
    }
  }

  return NextResponse.json(data)
}
