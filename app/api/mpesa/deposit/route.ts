import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMpesaClient, MpesaClient, MpesaConfigError } from '@/lib/mpesa/client'

// Initiate an M-Pesa STK Push for the authenticated member.
//
// Auth: required. The phone STK Push is sent to is taken from the user's
// profile, NOT from the request body — we don't let one user push an STK
// prompt to another user's phone. (A different-phone deposit can be added
// later behind explicit consent flow.)
//
// Bounds: KES 10..500,000 per Daraja sandbox limits.
//
// Persistence: a pending row is inserted into mpesa_transactions BEFORE we
// hit Daraja so a fast callback can never arrive before we have a row to
// reconcile against. The row is updated to 'failed' if Daraja rejects the
// request.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      amount?: number
    }
    const amount = Number(body.amount)

    if (!Number.isFinite(amount) || amount < 10) {
      return NextResponse.json(
        { error: 'Minimum deposit is KES 10', success: false },
        { status: 400 }
      )
    }
    if (amount > 500_000) {
      return NextResponse.json(
        { error: 'Maximum deposit is KES 500,000', success: false },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: profile, error: profileErr } = await admin
      .from('users')
      .select('id, phone')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile?.phone) {
      return NextResponse.json(
        { error: 'No phone on file. Update your profile.', success: false },
        { status: 400 }
      )
    }

    let formattedPhone: string
    try {
      formattedPhone = MpesaClient.formatPhone(profile.phone)
    } catch {
      return NextResponse.json(
        { error: 'Invalid phone number on profile', success: false },
        { status: 400 }
      )
    }

    let mpesa
    try {
      mpesa = getMpesaClient()
    } catch (e) {
      if (e instanceof MpesaConfigError) {
        console.error('[mpesa:deposit]', e.message)
        return NextResponse.json(
          { error: 'M-Pesa is not configured on the server', success: false },
          { status: 503 }
        )
      }
      throw e
    }

    // Insert pending row first. If Daraja errors below, we update it to
    // failed so the user sees the right state in their history.
    const { data: pending, error: pendingErr } = await admin
      .from('mpesa_transactions')
      .insert({
        member_id: user.id,
        amount,
        phone_number: formattedPhone,
        transaction_type: 'deposit',
        status: 'pending',
      })
      .select('id, transaction_ref')
      .single()

    if (pendingErr || !pending) {
      console.error('[mpesa:deposit] failed to insert pending row', pendingErr)
      return NextResponse.json(
        { error: 'Failed to record transaction', success: false },
        { status: 500 }
      )
    }

    let stkResult
    try {
      stkResult = await mpesa.stkPush({
        phone: formattedPhone,
        amount,
        accountRef: pending.transaction_ref.slice(0, 12),
        transactionDesc: 'SANGA Deposit',
      })
    } catch (e: any) {
      await admin
        .from('mpesa_transactions')
        .update({
          status: 'failed',
          result_desc: e?.message ?? 'STK Push failed',
        })
        .eq('id', pending.id)

      console.error('[mpesa:deposit] stkPush failed', e?.message)
      return NextResponse.json(
        { error: e?.message ?? 'STK Push failed', success: false },
        { status: 502 }
      )
    }

    await admin
      .from('mpesa_transactions')
      .update({
        checkout_request_id: stkResult.CheckoutRequestID,
        merchant_request_id: stkResult.MerchantRequestID,
      })
      .eq('id', pending.id)

    return NextResponse.json({
      success: true,
      transactionId: pending.id,
      checkoutRequestId: stkResult.CheckoutRequestID,
      message: 'STK Push sent. Check your phone and enter PIN to complete.',
    })
  } catch (error: any) {
    console.error('[mpesa:deposit] error', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to initiate deposit', success: false },
      { status: 500 }
    )
  }
}
