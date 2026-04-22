import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { sendEmail, emailTemplates } from '@/lib/email/send'
import { logAudit, AuditAction } from '@/lib/audit'

// Strict per-template schemas. All `data.*` fields below are interpolated into
// HTML elsewhere; templates already HTML-escape, but validating here also blocks
// "KES undefined" / "Receipt: null" cases from the outgoing email.
const welcomeSchema = z.object({
  name: z.string().min(1).max(200),
  memberNumber: z.string().min(1).max(64),
})

const loanApprovedSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().finite().nonnegative(),
  totalRepayable: z.number().finite().nonnegative(),
})

const loanRejectedSchema = z.object({
  name: z.string().min(1).max(200),
  reason: z.string().min(1).max(1000),
})

const depositSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().finite().nonnegative(),
  balance: z.number().finite().nonnegative(),
  receipt: z.string().min(1).max(128),
})

const envelopeSchema = z.object({
  type: z.enum(['welcome', 'loan_approved', 'loan_rejected', 'deposit']),
  recipient: z.string().email().max(320),
  data: z.record(z.string(), z.any()),
})

export async function POST(request: Request) {
  // Admin gate. This route dispatches templates that impersonate SANGA
  // ("Your Loan Has Been Approved", "Deposit Successful") from a verified
  // sender. A world-callable version is a spam/phishing cannon. Gate here
  // and send from server-side routes (see app/api/admin/loans/route.ts,
  // app/api/admin/members/route.ts) for system-triggered mail.
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { user: actingAdmin } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const envelope = envelopeSchema.safeParse(body)
  if (!envelope.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: envelope.error.issues },
      { status: 400 }
    )
  }
  const { type, recipient, data } = envelope.data

  let template: { subject: string; html: string }
  switch (type) {
    case 'welcome': {
      const parsed = welcomeSchema.safeParse(data)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid data for welcome', details: parsed.error.issues },
          { status: 400 }
        )
      }
      template = emailTemplates.welcome(parsed.data.name, parsed.data.memberNumber)
      break
    }
    case 'loan_approved': {
      const parsed = loanApprovedSchema.safeParse(data)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid data for loan_approved', details: parsed.error.issues },
          { status: 400 }
        )
      }
      template = emailTemplates.loanApproved(
        parsed.data.name,
        parsed.data.amount,
        parsed.data.totalRepayable
      )
      break
    }
    case 'loan_rejected': {
      const parsed = loanRejectedSchema.safeParse(data)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid data for loan_rejected', details: parsed.error.issues },
          { status: 400 }
        )
      }
      template = emailTemplates.loanRejected(parsed.data.name, parsed.data.reason)
      break
    }
    case 'deposit': {
      const parsed = depositSchema.safeParse(data)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid data for deposit', details: parsed.error.issues },
          { status: 400 }
        )
      }
      template = emailTemplates.depositConfirmation(
        parsed.data.name,
        parsed.data.amount,
        parsed.data.balance,
        parsed.data.receipt
      )
      break
    }
  }

  const result = await sendEmail({
    to: recipient,
    subject: template.subject,
    html: template.html,
    auditUserId: actingAdmin.id,
  })

  logAudit(
    actingAdmin.id,
    AuditAction.SETTINGS_CHANGE,
    {
      operation: 'email_send',
      type,
      recipient,
      success: result.success,
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined,
  ).catch((e) => console.error('audit log failed:', e))

  return NextResponse.json(result)
}
