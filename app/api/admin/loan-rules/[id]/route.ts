import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  handleError,
  ValidationError,
  NotFoundError,
} from '@/lib/errors/handlers'

type PatchBody = {
  age_min?: number
  age_max?: number
  requires_guarantors?: boolean
  min_guarantors?: number
  max_instant_loan?: number
  interest_rate?: number
  is_active?: boolean
  notes?: string | null
}

/**
 * PATCH /api/admin/loan-rules/[id]
 *   Update any subset of fields on a rule. Most commonly used to flip
 *   is_active=false (compliance kill-switch for a single band).
 *
 * DELETE /api/admin/loan-rules/[id]
 *   Hard-delete a rule. Prefer PATCH is_active=false unless you're
 *   cleaning up a test seed row.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin()
    if ('response' in auth) return auth.response

    const { id } = await params
    if (!id) throw new ValidationError('id is required')

    const body = (await request.json()) as PatchBody
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    for (const field of [
      'age_min',
      'age_max',
      'requires_guarantors',
      'min_guarantors',
      'max_instant_loan',
      'interest_rate',
      'is_active',
      'notes',
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 1) {
      throw new ValidationError('no updatable fields provided')
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('loan_rules_by_age')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('rule')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, rule: data })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin()
    if ('response' in auth) return auth.response

    const { id } = await params
    if (!id) throw new ValidationError('id is required')

    const admin = createAdminClient()
    const { error } = await admin
      .from('loan_rules_by_age')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
