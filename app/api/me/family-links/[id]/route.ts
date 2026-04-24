import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/handlers'

/**
 * DELETE /api/me/family-links/[id]
 *
 * Revoke a pending or accepted link. Either party may revoke. Enforced
 * server-side by the revoke_family_link RPC, which sets
 * status='revoked' instead of deleting — so the audit trail survives.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id || typeof id !== 'string') {
      throw new ValidationError('invalid link id')
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data, error } = await supabase.rpc('revoke_family_link', {
      p_link_id: id,
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('link not found')) {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 })
      }
      if (msg.includes('not a party')) {
        return NextResponse.json(
          { error: 'You are not a party to this link.' },
          { status: 403 },
        )
      }
      if (msg.includes('already') && msg.includes('nothing to revoke')) {
        return NextResponse.json(
          { error: 'This link is already closed.' },
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
