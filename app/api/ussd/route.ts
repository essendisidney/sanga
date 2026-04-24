import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  routeUssd,
  formatResponse,
  type UssdInput,
} from '@/lib/ussd/state-machine'

/**
 * POST /api/ussd
 *
 * Africa's Talking-compatible USSD webhook.
 *
 * Provider posts:
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: sessionId=...&serviceCode=...&phoneNumber=...&text=...
 *
 * We respond with plain text starting with "CON " (more input expected)
 * or "END " (terminate session). 182 char body limit per response.
 *
 * Security:
 *   - The webhook is internet-facing so Africa's Talking can hit it.
 *   - We require a shared secret in either the X-USSD-Secret header or
 *     the `secret` query string param. Configure USSD_WEBHOOK_SECRET in
 *     your environment, then add the same value to your AT callback URL
 *     (e.g. https://www.sanga.africa/api/ussd?secret=...).
 *   - Without the secret, the route refuses requests so attackers can't
 *     enumerate phone numbers or spam our DB via this endpoint.
 *
 * No-secret mode (NOT for production):
 *   - If USSD_WEBHOOK_SECRET is unset we still accept requests and log
 *     a warning. This makes local dev painless.
 *
 * To wire up:
 *   1. Sign up for an Africa's Talking account.
 *   2. Provision a USSD shortcode (e.g. *384*1234#).
 *   3. Set the callback URL to https://YOURDOMAIN/api/ussd?secret=...
 *   4. Set USSD_WEBHOOK_SECRET in Vercel env to the same value.
 */
export async function POST(request: NextRequest) {
  try {
    const requiredSecret = process.env.USSD_WEBHOOK_SECRET
    if (requiredSecret) {
      const headerSecret = request.headers.get('x-ussd-secret')
      const querySecret = request.nextUrl.searchParams.get('secret')
      if (headerSecret !== requiredSecret && querySecret !== requiredSecret) {
        return new NextResponse('END Unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' },
        })
      }
    } else {
      console.warn(
        '[USSD] USSD_WEBHOOK_SECRET is not set. The /api/ussd webhook is publicly accessible. Set it before going to production.',
      )
    }

    let input: UssdInput

    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData()
      input = {
        sessionId: String(form.get('sessionId') ?? ''),
        serviceCode: String(form.get('serviceCode') ?? ''),
        phoneNumber: String(form.get('phoneNumber') ?? ''),
        text: String(form.get('text') ?? ''),
      }
    } else if (contentType.includes('application/json')) {
      const body = await request.json()
      input = {
        sessionId: String(body?.sessionId ?? ''),
        serviceCode: String(body?.serviceCode ?? ''),
        phoneNumber: String(body?.phoneNumber ?? ''),
        text: String(body?.text ?? ''),
      }
    } else {
      // try form anyway — some sandboxes omit content-type
      try {
        const form = await request.formData()
        input = {
          sessionId: String(form.get('sessionId') ?? ''),
          serviceCode: String(form.get('serviceCode') ?? ''),
          phoneNumber: String(form.get('phoneNumber') ?? ''),
          text: String(form.get('text') ?? ''),
        }
      } catch {
        return new NextResponse('END Bad request', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        })
      }
    }

    if (!input.phoneNumber) {
      return new NextResponse('END Missing phone number', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const supabase = createAdminClient()
    const result = await routeUssd(supabase, input)

    return new NextResponse(formatResponse(result), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (err) {
    console.error('[USSD] handler error', err)
    return new NextResponse(
      'END We had a technical issue. Please try again or use the SANGA app.',
      {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      },
    )
  }
}

/**
 * GET /api/ussd — health check / human-friendly preview.
 *
 * Lets you verify the route is reachable from a browser without
 * exposing real menu data. Always returns plain text.
 */
export async function GET() {
  return new NextResponse(
    'SANGA USSD endpoint OK. POST application/x-www-form-urlencoded with sessionId, serviceCode, phoneNumber, text.',
    {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    },
  )
}
