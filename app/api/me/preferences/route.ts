import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/handlers'

const VALID_MODES = ['digital', 'simplified', 'hybrid'] as const
type ExperienceMode = (typeof VALID_MODES)[number]

/**
 * GET /api/me/preferences
 *
 * Returns the caller's UI preferences. Falls back to 'digital' if the
 * user has no persona row yet (the row is lazily created on first PATCH).
 *
 * Response: { experience_mode: 'digital' | 'simplified' | 'hybrid' }
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    const { data, error } = await supabase
      .from('user_personas')
      .select('experience_mode, persona_type, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      experience_mode: (data?.experience_mode as ExperienceMode) ?? 'digital',
      persona_type: data?.persona_type ?? null,
      updated_at: data?.updated_at ?? null,
    })
  } catch (error) {
    return handleError(error)
  }
}

/**
 * PATCH /api/me/preferences
 *
 * Body: { experience_mode: 'digital' | 'simplified' | 'hybrid' }
 *
 * Upserts the user's preferred experience mode via set_experience_mode RPC.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    let body: { experience_mode?: string } = {}
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('invalid JSON body')
    }

    const mode = String(body?.experience_mode ?? '').trim() as ExperienceMode
    if (!VALID_MODES.includes(mode)) {
      throw new ValidationError(
        `experience_mode must be one of: ${VALID_MODES.join(', ')}`,
      )
    }

    const { data, error } = await supabase.rpc('set_experience_mode', {
      p_mode: mode,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({
      success: true,
      experience_mode: row?.experience_mode ?? mode,
      persona_type: row?.persona_type ?? null,
      updated_at: row?.updated_at ?? new Date().toISOString(),
    })
  } catch (error) {
    return handleError(error)
  }
}
