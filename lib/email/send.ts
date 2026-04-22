import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

// Lazy singleton: constructing Resend at module scope without RESEND_API_KEY
// throws "Missing API key", which blows up `next build`'s page-data collection.
// Building the client on first send keeps the module safe to import everywhere.
let resendClient: Resend | null = null
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!resendClient) resendClient = new Resend(key)
  return resendClient
}

// Escape user-supplied strings before interpolating into HTML templates.
// Names/phones/reasons are typed by staff, but once members can edit their
// profile this is the only thing stopping <script>/<img onerror=...> payloads
// from getting into inboxes and tripping spam filters.
export function escapeHtml(s: unknown): string {
  const str = String(s ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

async function logEmailFailure(userId: string | undefined, reason: unknown, meta: Record<string, unknown>) {
  if (!userId) return
  try {
    const supabase = await createClient()
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'email_failed',
      details: { reason: String((reason as any)?.message || reason), ...meta },
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('failed to audit email failure:', e)
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  auditUserId,
}: {
  to: string
  subject: string
  html?: string
  text?: string
  /** Optional: if set, failures write an `email_failed` row to audit_logs. */
  auditUserId?: string
}) {
  const resend = getResend()
  if (!resend) {
    console.error('Email send skipped: RESEND_API_KEY is not set')
    await logEmailFailure(auditUserId, 'RESEND_API_KEY not configured', { to, subject })
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const finalHtml = html || (text ? `<p>${escapeHtml(text)}</p>` : '')
  const finalText = text || (html ? stripHtml(html) : '')

  try {
    const { data, error } = await resend.emails.send({
      from: 'SANGA <notifications@sanga.africa>',
      to: [to],
      subject,
      html: finalHtml,
      text: finalText,
    })

    if (error) {
      console.error('Email error:', error)
      await logEmailFailure(auditUserId, error, { to, subject })
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Email send failed:', error)
    await logEmailFailure(auditUserId, error, { to, subject })
    return { success: false, error }
  }
}

export const emailTemplates = {
  welcome: (name: string, memberNumber: string) => ({
    subject: 'Welcome to SANGA!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1A2A4F; padding: 20px; text-align: center;">
          <h1 style="color: #D4AF37; margin: 0;">SANGA</h1>
          <p style="color: white;">Connecting Africa&#39;s Wealth</p>
        </div>
        <div style="padding: 20px;">
          <h2>Welcome, ${escapeHtml(name)}!</h2>
          <p>Your membership has been successfully created.</p>
          <p><strong>Member Number:</strong> ${escapeHtml(memberNumber)}</p>
          <p>Download our app to start saving and borrowing.</p>
          <a href="https://sanga.africa/login" style="background-color: #D4AF37; color: #1A2A4F; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login Now</a>
        </div>
        <div style="background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 12px; color: #666;">
          <p>&copy; 2026 SANGA Financial Network. All rights reserved.</p>
        </div>
      </div>
    `,
  }),

  loanApproved: (name: string, amount: number, totalRepayable: number) => ({
    subject: 'Your Loan Has Been Approved!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1A2A4F; padding: 20px; text-align: center;">
          <h1 style="color: #D4AF37;">SANGA</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Congratulations, ${escapeHtml(name)}!</h2>
          <p>Your loan application has been <strong style="color: green;">APPROVED</strong>.</p>
          <p><strong>Amount:</strong> KES ${Number(amount).toLocaleString()}</p>
          <p><strong>Total Repayable:</strong> KES ${Number(totalRepayable).toLocaleString()}</p>
          <p>Funds will be disbursed to your account shortly.</p>
        </div>
      </div>
    `,
  }),

  loanRejected: (name: string, reason: string) => ({
    subject: 'Update on Your Loan Application',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1A2A4F; padding: 20px; text-align: center;">
          <h1 style="color: #D4AF37;">SANGA</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Dear ${escapeHtml(name)},</h2>
          <p>Your loan application has been <strong style="color: red;">REJECTED</strong>.</p>
          <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
          <p>Please contact support for more information.</p>
        </div>
      </div>
    `,
  }),

  depositConfirmation: (name: string, amount: number, balance: number, receipt: string) => ({
    subject: 'Deposit Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1A2A4F; padding: 20px; text-align: center;">
          <h1 style="color: #D4AF37;">SANGA</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Deposit Successful!</h2>
          <p>Dear ${escapeHtml(name)},</p>
          <p>KES ${Number(amount).toLocaleString()} has been deposited to your account.</p>
          <p><strong>New Balance:</strong> KES ${Number(balance).toLocaleString()}</p>
          <p><strong>Receipt No:</strong> ${escapeHtml(receipt)}</p>
        </div>
      </div>
    `,
  }),
}
