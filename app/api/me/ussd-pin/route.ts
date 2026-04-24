import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/handlers'

/**
 * GET /api/me/ussd-pin
 *
 * Returns whether the caller has set their USSD PIN.
 * Never returns the PIN itself or the hash.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data, error } = await supabase
      .from('users')
      .select('ussd_pin_set_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      has_pin: Boolean(data?.ussd_pin_set_at),
      set_at: data?.ussd_pin_set_at ?? null,
    })
  } catch (error) {
    return handleError(error)
  }
}

/**
 * PATCH /api/me/ussd-pin
 *
 * Body: { pin: '4-6 digit string' }
 *
 * Stores a salted bf hash via set_ussd_pin RPC. Plain PIN never lands
 * in the DB. Once set, the member can use write-side USSD operations
 * (planned: loan apply, withdraw to M-Pesa) by entering this PIN at
 * the prompt.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    let body: { pin?: unknown } = {}
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('invalid JSON body')
    }

    const pin = String(body?.pin ?? '').trim()
    if (!/^[0-9]{4,6}$/.test(pin)) {
      throw new ValidationError('PIN must be 4 to 6 digits')
    }

    const { error } = await supabase.rpc('set_ussd_pin', { p_pin: pin })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, has_pin: true })
  } catch (error) {
    return handleError(error)
  }
}
