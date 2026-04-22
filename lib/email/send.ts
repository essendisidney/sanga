import { Resend } from 'resend'

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

export async function sendEmail({
  to,
  subject,
  html,
  text
}: {
  to: string
  subject: string
  html?: string
  text?: string
}) {
  const resend = getResend()
  if (!resend) {
    console.error('Email send skipped: RESEND_API_KEY is not set')
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }
  try {
    const { data, error } = await resend.emails.send({
      from: 'SANGA <notifications@sanga.africa>',
      to: [to],
      subject,
      html: html || `<p>${text}</p>`,
      text: text || ''
    })

    if (error) {
      console.error('Email error:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Email send failed:', error)
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
          <p style="color: white;">Connecting Africa's Wealth</p>
        </div>
        <div style="padding: 20px;">
          <h2>Welcome, ${name}!</h2>
          <p>Your membership has been successfully created.</p>
          <p><strong>Member Number:</strong> ${memberNumber}</p>
          <p>Download our app to start saving and borrowing.</p>
          <a href="https://sanga.africa/login" style="background-color: #D4AF37; color: #1A2A4F; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login Now</a>
        </div>
        <div style="background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 12px; color: #666;">
          <p>© 2026 SANGA Financial Network. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  loanApproved: (name: string, amount: number, totalRepayable: number) => ({
    subject: 'Your Loan Has Been Approved!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1A2A4F; padding: 20px; text-align: center;">
          <h1 style="color: #D4AF37;">SANGA</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Congratulations, ${name}!</h2>
          <p>Your loan application has been <strong style="color: green;">APPROVED</strong>.</p>
          <p><strong>Amount:</strong> KES ${amount.toLocaleString()}</p>
          <p><strong>Total Repayable:</strong> KES ${totalRepayable.toLocaleString()}</p>
          <p>Funds will be disbursed to your account shortly.</p>
        </div>
      </div>
    `
  }),

  loanRejected: (name: string, reason: string) => ({
    subject: 'Update on Your Loan Application',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1A2A4F; padding: 20px; text-align: center;">
          <h1 style="color: #D4AF37;">SANGA</h1>
        </div>
        <div style="padding: 20px;">
          <h2>Dear ${name},</h2>
          <p>Your loan application has been <strong style="color: red;">REJECTED</strong>.</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>Please contact support for more information.</p>
        </div>
      </div>
    `
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
          <p>Dear ${name},</p>
          <p>KES ${amount.toLocaleString()} has been deposited to your account.</p>
          <p><strong>New Balance:</strong> KES ${balance.toLocaleString()}</p>
          <p><strong>Receipt No:</strong> ${receipt}</p>
        </div>
      </div>
    `
  })
}
