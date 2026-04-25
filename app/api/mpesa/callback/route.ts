import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Daraja STK Push callback receiver.
//
// Security model:
//   1. We use the service-role admin client. Safaricom never carries our
//      cookies, so cookie-based clients would land as anon and fail RLS.
//   2. Optional shared secret. If MPESA_CALLBACK_SECRET is set, the URL
//      we register with Safaricom must include `?secret=<value>` and we
//      reject any callback that doesn't carry it. Without this, anyone
//      who guesses the URL can POST a fake "successful" payment for any
//      pending CheckoutRequestID. (The atomic RPC also has unique-receipt
//      and status-pending guards, so this is defense-in-depth, not the
//      only line of defense.)
//   3. The credit itself happens inside process_mpesa_deposit_callback,
//      a SECURITY DEFINER RPC that locks the row, checks idempotency,
//      credits savings, writes the ledger entry and updates status — all
//      in one transaction.
//
// Always returns ResultCode: 0 to Safaricom unless we want them to retry.
// Daraja retries aggressively on non-zero responses, which can amplify
// any bug into an outage.

interface DarajaItem {
  Name: string
  Value: string | number
}

interface DarajaCallback {
  MerchantRequestID?: string
  CheckoutRequestID?: string
  ResultCode?: number
  ResultDesc?: string
  CallbackMetadata?: { Item?: DarajaItem[] }
}

interface DarajaPayload {
  Body?: { stkCallback?: DarajaCallback }
}

function readItem(items: DarajaItem[] | undefined, name: string): unknown {
  return items?.find((i) => i.Name === name)?.Value
}

export async function POST(request: Request) {
  // Optional shared-secret check.
  const expectedSecret = process.env.MPESA_CALLBACK_SECRET
  if (expectedSecret) {
    const url = new URL(request.url)
    const provided = url.searchParams.get('secret')
    if (provided !== expectedSecret) {
      console.warn('[mpesa:callback] rejected: bad/missing secret')
      // Return 200 with non-zero ResultCode so Safaricom doesn't keep
      // retrying a request we'll never accept.
      return NextResponse.json(
        { ResultCode: 1, ResultDesc: 'Rejected' },
        { status: 200 }
      )
    }
  } else {
    console.warn(
      '[mpesa:callback] MPESA_CALLBACK_SECRET not set — accepting all callbacks. Set this env var in production.'
    )
  }

  let payload: DarajaPayload
  try {
    payload = (await request.json()) as DarajaPayload
  } catch {
    return NextResponse.json(
      { ResultCode: 1, ResultDesc: 'Invalid JSON' },
      { status: 200 }
    )
  }

  const cb = payload?.Body?.stkCallback
  if (!cb || !cb.CheckoutRequestID) {
    console.warn('[mpesa:callback] malformed payload', payload)
    return NextResponse.json(
      { ResultCode: 1, ResultDesc: 'Invalid callback' },
      { status: 200 }
    )
  }

  const items = cb.CallbackMetadata?.Item
  const mpesaReceipt = readItem(items, 'MpesaReceiptNumber') as
    | string
    | undefined
  const callbackAmount = readItem(items, 'Amount') as number | undefined

  const admin = createAdminClient()

  try {
    const { data, error } = await admin.rpc('process_mpesa_deposit_callback', {
      p_checkout_request_id: cb.CheckoutRequestID,
      p_mpesa_receipt: mpesaReceipt ?? null,
      p_amount: callbackAmount ?? 0,
      p_result_code: cb.ResultCode ?? 1,
      p_result_desc: cb.ResultDesc ?? null,
    })

    if (error) {
      console.error('[mpesa:callback] RPC failed', {
        checkoutRequestId: cb.CheckoutRequestID,
        message: error.message,
      })
      // Return 0 anyway — retries won't help if our DB is unhappy.
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Recorded' })
    }

    const result = Array.isArray(data) ? data[0] : data
    console.log('[mpesa:callback] processed', {
      checkoutRequestId: cb.CheckoutRequestID,
      status: result?.status,
      receipt: mpesaReceipt,
      amount: callbackAmount,
    })
  } catch (e) {
    console.error('[mpesa:callback] unexpected error', e)
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
}
