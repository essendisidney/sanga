import { NextResponse } from 'next/server'
import { sendEmail, emailTemplates } from '@/lib/email/send'

export async function POST(request: Request) {
  const { type, recipient, data } = await request.json()

  let template
  switch (type) {
    case 'welcome':
      template = emailTemplates.welcome(data.name, data.memberNumber)
      break
    case 'loan_approved':
      template = emailTemplates.loanApproved(data.name, data.amount, data.totalRepayable)
      break
    case 'loan_rejected':
      template = emailTemplates.loanRejected(data.name, data.reason)
      break
    case 'deposit':
      template = emailTemplates.depositConfirmation(data.name, data.amount, data.balance, data.receipt)
      break
    default:
      return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  }

  const result = await sendEmail({
    to: recipient,
    subject: template.subject,
    html: template.html
  })

  return NextResponse.json(result)
}
