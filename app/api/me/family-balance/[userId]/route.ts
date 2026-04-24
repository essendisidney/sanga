import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
  NotFoundError,
} from '@/lib/errors/handlers'

/**
 * GET /api/me/family-balance/[userId]
 *
 * Returns savings / shares / loan balance of a target user IF the
 * caller has an accepted family_link with can_view_balance=TRUE.
 *
 * Permission check is done inside the get_family_balance RPC — it
 * returns no rows when the caller is not allowed, so we 404 here to
 * avoid leaking "the user exists but you can't see them" vs "the user
 * doesn't exist".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('invalid user id')
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data, error } = await supabase.rpc('get_family_balance', {
      p_target_user_id: userId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      throw new NotFoundError('Account')
    }

    return NextResponse.json({
      full_name: row.full_name,
      sacco_id: row.sacco_id,
      savings: Number(row.savings ?? 0),
      shares: Number(row.shares ?? 0),
      loan_balance: Number(row.loan_balance ?? 0),
      total: Number(row.savings ?? 0) + Number(row.shares ?? 0),
      relationship: row.relationship,
    })
  } catch (error) {
    return handleError(error)
  }
}
