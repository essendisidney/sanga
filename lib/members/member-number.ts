import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generate a member number in the form `SGA-YYYY-NNNNNN`, padded 6 digits.
 *
 * Naive: counts current memberships and increments. This is NOT race-safe —
 * two admins hitting POST /admin/members at the same second can collide.
 * A proper fix is a Postgres sequence or a trigger; this is the v1 stop-gap.
 */
export async function generateMemberNumber(
  supabase: SupabaseClient,
  saccoId: string
): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('sacco_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('sacco_id', saccoId)

  const next = (count ?? 0) + 1
  return `SGA-${year}-${String(next).padStart(6, '0')}`
}
