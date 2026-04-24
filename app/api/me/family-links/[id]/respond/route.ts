import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/handlers'

/**
 * POST /api/me/family-links/[id]/respond
 *
 * Body: { action: 'accept' | 'decline' }
 *
 * Only the invitee (family_links.to_user_id) may respond, and only
 * while the link is still pending. Enforced server-side by the
 * respond_to_family_link RPC.
 */
export async function POST(
  request: Request,
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

    let body: { action?: string } = {}
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('invalid JSON body')
    }

    const action = String(body?.action ?? '').trim()
    if (action !== 'accept' && action !== 'decline') {
      throw new ValidationError("action must be 'accept' or 'decline'")
    }

    const { data, error } = await supabase.rpc('respond_to_family_link', {
      p_link_id: id,
      p_accept: action === 'accept',
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('link not found')) {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 })
      }
      if (msg.includes('only the invitee')) {
        return NextResponse.json(
          { error: 'Only the invitee can accept or decline this link.' },
          { status: 403 },
        )
      }
      if (msg.includes('not pending')) {
        return NextResponse.json(
          { error: 'This link has already been answered.' },
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
