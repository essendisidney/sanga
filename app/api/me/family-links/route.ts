import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/handlers'

const VALID_RELATIONSHIPS = [
  'parent',
  'child',
  'guardian',
  'spouse',
  'sibling',
  'dependant',
] as const

type Relationship = (typeof VALID_RELATIONSHIPS)[number]

/**
 * GET /api/me/family-links
 *
 * List all family links the caller is part of (either direction).
 * Each row is annotated with `direction` ('outgoing' | 'incoming') and
 * `other_user` summary so the UI doesn't need a second round-trip.
 *
 * Query params:
 *   status   — filter by status ('pending'|'accepted'|'declined'|'revoked')
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const url = new URL(request.url)
    const statusFilter = url.searchParams.get('status')

    let query = supabase
      .from('family_links')
      .select(
        `id, from_user_id, to_user_id, relationship, can_guarantee,
         can_view_balance, status, invited_at, responded_at,
         revoked_at, created_at, updated_at,
         from_user:users!family_links_from_user_id_fkey ( id, full_name, phone ),
         to_user:users!family_links_to_user_id_fkey     ( id, full_name, phone )`,
      )
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })

    if (statusFilter && ['pending', 'accepted', 'declined', 'revoked'].includes(statusFilter)) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []).map((row: any) => {
      const direction: 'outgoing' | 'incoming' =
        row.from_user_id === user.id ? 'outgoing' : 'incoming'
      const other = direction === 'outgoing' ? row.to_user : row.from_user
      return {
        id: row.id,
        direction,
        relationship: row.relationship,
        can_guarantee: row.can_guarantee,
        can_view_balance: row.can_view_balance,
        status: row.status,
        invited_at: row.invited_at,
        responded_at: row.responded_at,
        revoked_at: row.revoked_at,
        other_user: other
          ? { id: other.id, full_name: other.full_name, phone: other.phone }
          : null,
      }
    })

    return NextResponse.json({ links: rows })
  } catch (error) {
    return handleError(error)
  }
}

/**
 * POST /api/me/family-links
 *
 * Create a pending family link invite. The target is resolved by phone,
 * email, or member number inside the create_family_link RPC. Permission
 * flags (can_guarantee, can_view_balance) default to FALSE and must be
 * explicitly requested.
 *
 * Body: {
 *   identifier: string        // phone | email | member_number
 *   relationship: string      // one of VALID_RELATIONSHIPS
 *   can_guarantee?: boolean
 *   can_view_balance?: boolean
 * }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    let body: {
      identifier?: string
      relationship?: string
      can_guarantee?: boolean
      can_view_balance?: boolean
    } = {}
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('invalid JSON body')
    }

    const identifier = String(body?.identifier ?? '').trim()
    if (!identifier) {
      throw new ValidationError('identifier (phone, email, or member number) is required')
    }

    const relationship = String(body?.relationship ?? '').trim() as Relationship
    if (!VALID_RELATIONSHIPS.includes(relationship)) {
      throw new ValidationError(
        `relationship must be one of: ${VALID_RELATIONSHIPS.join(', ')}`,
      )
    }

    const { data, error } = await supabase.rpc('create_family_link', {
      p_identifier: identifier,
      p_relationship: relationship,
      p_can_guarantee: Boolean(body.can_guarantee),
      p_can_view_balance: Boolean(body.can_view_balance),
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('no user found')) {
        return NextResponse.json(
          { error: 'No SANGA member matches that phone / email / member number.' },
          { status: 404 },
        )
      }
      if (msg.includes('cannot link to yourself')) {
        return NextResponse.json(
          { error: 'You cannot create a family link to yourself.' },
          { status: 400 },
        )
      }
      if (msg.includes('duplicate') || error.code === '23505') {
        return NextResponse.json(
          {
            error:
              'A pending or accepted link with this member already exists. Revoke it before creating a new one.',
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ success: true, link: data })
  } catch (error) {
    return handleError(error)
  }
}
