import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleError, UnauthorizedError } from '@/lib/errors/handlers'

/**
 * GET /api/me/family-guarantors
 *
 * Lists family members who have consented to be eligible guarantors
 * for the caller. Only returns users with an accepted family_link
 * where can_guarantee = TRUE. Never returns balance / account data —
 * that requires a separate can_view_balance grant per target.
 *
 * The loan application UI uses this to auto-populate a "Your family
 * guarantors" picklist, saving members the typing of phone numbers.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data, error } = await supabase.rpc('list_eligible_family_guarantors')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      guarantors: (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        full_name: row.full_name,
        relationship: row.relationship,
        phone: row.phone,
        link_id: row.link_id,
      })),
    })
  } catch (error) {
    return handleError(error)
  }
}
