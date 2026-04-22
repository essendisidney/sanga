import { NextResponse } from 'next/server'

export type LoanApplication = {
  id: string
  phone: string
  amount: number
  purpose: string
  duration: number
  status: 'pending' | 'approved' | 'rejected' | 'disbursed'
  appliedAt: number
}

// In-memory store, same pattern as the OTP store. Swap for a real DB
// (Supabase `loans` table keyed by phone) when we're ready to persist.
export const loansStore = new Map<string, LoanApplication[]>()

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      phone?: string
      amount?: number
      purpose?: string
      duration?: number
    }
    const { phone, amount, purpose, duration } = body

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { success: false, error: 'phone is required' },
        { status: 400 }
      )
    }
    if (!amount || amount < 1000) {
      return NextResponse.json(
        { success: false, error: 'amount must be at least KES 1,000' },
        { status: 400 }
      )
    }
    if (!purpose || typeof purpose !== 'string') {
      return NextResponse.json(
        { success: false, error: 'purpose is required' },
        { status: 400 }
      )
    }
    const dur = Number(duration ?? 30)
    if (!Number.isFinite(dur) || dur < 7) {
      return NextResponse.json(
        { success: false, error: 'duration must be at least 7 days' },
        { status: 400 }
      )
    }

    const application: LoanApplication = {
      id: 'LN_' + Date.now().toString(36).toUpperCase(),
      phone,
      amount,
      purpose,
      duration: dur,
      status: 'pending',
      appliedAt: Date.now(),
    }

    const existing = loansStore.get(phone) ?? []
    existing.unshift(application)
    loansStore.set(phone, existing)

    console.log(`📄 Loan application: ${application.id}`, application)

    return NextResponse.json({ success: true, application })
  } catch (error) {
    console.error('Loan apply error:', error)
    return NextResponse.json(
      { success: false, error: 'Submission failed' },
      { status: 500 }
    )
  }
}
