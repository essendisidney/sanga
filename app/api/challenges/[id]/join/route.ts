import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/handlers'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) throw new ValidationError('challenge id is required')

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data, error } = await supabase.rpc('join_savings_challenge', {
      p_challenge_id: id,
    })

    if (error) {
      const msg = error.message || 'Could not join challenge'
      if (msg.includes('challenge not available')) {
        return NextResponse.json({ error: msg }, { status: 404 })
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ success: true, participation: data })
  } catch (error) {
    return handleError(error)
  }
}
