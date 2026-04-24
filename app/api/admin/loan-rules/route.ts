import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  handleError,
  ValidationError,
} from '@/lib/errors/handlers'

/**
 * Admin API for age-based loan rules.
 *
 * REGULATORY NOTE: Age-based differentiation of loan terms carries
 * discrimination risk in most jurisdictions (Kenya Consumer Protection
 * Act 2012, SASRA). We keep this feature live at the product owner's
 * acknowledged risk — the UI exposes a global kill-switch via
 * PATCH { is_active:false } so compliance can deactivate cleanly.
 *
 * GET    /api/admin/loan-rules           — list all rules (active + inactive)
 * POST   /api/admin/loan-rules           — create a new rule
 * PATCH  /api/admin/loan-rules           — bulk kill-switch { set_all_active: false }
 */

type RuleBody = {
  sacco_id?: string | null
  age_min?: number
  age_max?: number
  requires_guarantors?: boolean
  min_guarantors?: number
  max_instant_loan?: number
  interest_rate?: number
  is_active?: boolean
  notes?: string | null
}

function validateBody(body: RuleBody): void {
  const toNumber = (v: unknown) => (typeof v === 'number' ? v : Number(v))

  if (body.age_min === undefined || body.age_max === undefined) {
    throw new ValidationError('age_min and age_max are required')
  }
  const min = toNumber(body.age_min)
  const max = toNumber(body.age_max)
  if (!Number.isFinite(min) || min < 0 || min > 150) {
    throw new ValidationError('age_min must be between 0 and 150')
  }
  if (!Number.isFinite(max) || max < min || max > 150) {
    throw new ValidationError('age_max must be >= age_min and <= 150')
  }

  if (body.min_guarantors !== undefined) {
    const g = toNumber(body.min_guarantors)
    if (!Number.isFinite(g) || g < 0 || g > 10) {
      throw new ValidationError('min_guarantors must be between 0 and 10')
    }
  }

  if (body.max_instant_loan !== undefined) {
    const m = toNumber(body.max_instant_loan)
    if (!Number.isFinite(m) || m < 0) {
      throw new ValidationError('max_instant_loan must be >= 0')
    }
  }

  if (body.interest_rate !== undefined) {
    const r = toNumber(body.interest_rate)
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      throw new ValidationError('interest_rate must be between 0 and 100')
    }
  }
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if ('response' in auth) return auth.response

    // Service role bypasses the "is_active" RLS read policy
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('loan_rules_by_age')
      .select('*')
      .order('is_active', { ascending: false })
      .order('sacco_id', { ascending: true, nullsFirst: true })
      .order('age_min', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rules: data ?? [] })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if ('response' in auth) return auth.response

    const body = (await request.json()) as RuleBody
    validateBody(body)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('loan_rules_by_age')
      .insert({
        sacco_id: body.sacco_id ?? null,
        age_min: body.age_min,
        age_max: body.age_max,
        requires_guarantors: Boolean(body.requires_guarantors),
        min_guarantors: body.min_guarantors ?? 0,
        max_instant_loan: body.max_instant_loan ?? 0,
        interest_rate: body.interest_rate ?? 0,
        is_active: body.is_active ?? true,
        notes: body.notes ?? null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A rule already exists for this sacco + age range' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, rule: data })
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin()
    if ('response' in auth) return auth.response

    const body = (await request.json()) as {
      set_all_active?: boolean
    }

    if (typeof body.set_all_active !== 'boolean') {
      throw new ValidationError('set_all_active (boolean) is required')
    }

    const admin = createAdminClient()
    const { error, count } = await admin
      .from('loan_rules_by_age')
      .update(
        { is_active: body.set_all_active, updated_at: new Date().toISOString() },
        { count: 'exact' },
      )
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      updated: count ?? 0,
      now_active: body.set_all_active,
    })
  } catch (error) {
    return handleError(error)
  }
}
