import { createClient } from '@/lib/supabase/server'

export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  TRANSACTION = 'transaction',
  LOAN_APPLY = 'loan_apply',
  LOAN_APPROVE = 'loan_approve',
  LOAN_REJECT = 'loan_reject',
  LOAN_DISBURSE = 'loan_disburse',
  MEMBER_CREATE = 'member_create',
  MEMBER_UPDATE = 'member_update',
  MEMBER_VERIFY = 'member_verify',
  SETTINGS_CHANGE = 'settings_change',
  APPROVAL_REQUESTED = 'approval_requested',
  APPROVAL_GRANTED = 'approval_granted',
  APPROVAL_REJECTED = 'approval_rejected',
  APPROVAL_ESCALATED = 'approval_escalated',
  TELLER_SESSION_OPEN = 'teller_session_open',
  TELLER_SESSION_CLOSE = 'teller_session_close',
  TELLER_SESSION_AUDIT = 'teller_session_audit',
  TICKET_CREATE = 'ticket_create',
  TICKET_UPDATE = 'ticket_update',
  TICKET_RESOLVE = 'ticket_resolve',
}

export type AuditContext = {
  /**
   * Entity being acted on, e.g. 'loan', 'member', 'transaction'.
   * Stored in the dedicated entity_type column for faster forensic queries.
   */
  entityType?: string
  entityId?: string | null
  /**
   * Prior state of the entity (for UPDATE actions). Stored as JSONB.
   */
  oldValues?: Record<string, unknown> | null
  /**
   * New state of the entity. Stored as JSONB.
   */
  newValues?: Record<string, unknown> | null
  /**
   * Explicit diff of fields that changed. If omitted when both old_values
   * and new_values are present, it will be computed shallowly.
   */
  changes?: Record<string, unknown> | null
  status?: 'success' | 'failure' | 'warning'
  errorMessage?: string
  /**
   * Role the actor held AT THE TIME of the action (roles can be revoked
   * later, so snapshotting here matters for forensic queries).
   */
  userRole?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
}

/**
 * Shallow diff helper: returns only keys whose values differ between
 * oldValues and newValues. Does NOT deep-compare; nested objects are
 * compared by JSON.stringify.
 */
function shallowDiff(
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!oldValues || !newValues) return null
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  for (const k of keys) {
    const a = oldValues[k]
    const b = newValues[k]
    const same =
      a === b ||
      (typeof a === 'object' && typeof b === 'object' &&
        JSON.stringify(a) === JSON.stringify(b))
    if (!same) diff[k] = { from: a, to: b }
  }
  return Object.keys(diff).length > 0 ? diff : null
}

/**
 * Writes a row to public.audit_logs. Designed to be safe to call from
 * every code path — any failure here is swallowed + logged to the console,
 * NEVER thrown, because audit logging should never take down the
 * user-facing request.
 *
 * Backward compatibility: old callers passed (userId, action, details, ip, ua).
 * That shape still works; `details` goes into the legacy `details` JSONB column
 * and the new forensic columns stay NULL.
 *
 * New shape: pass an AuditContext as the `details` parameter to populate
 * entity_type / entity_id / old_values / new_values / changes / status /
 * error_message. If an AuditContext is detected we ALSO write the full
 * context into `details` as a fallback for any legacy readers.
 */
export async function logAudit(
  userId: string | null,
  action: AuditAction | string,
  details: unknown,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  try {
    const supabase = await createClient()

    const ctx =
      details && typeof details === 'object' && !Array.isArray(details)
        ? (details as AuditContext & Record<string, unknown>)
        : null

    const effectiveChanges =
      ctx?.changes ?? shallowDiff(ctx?.oldValues ?? null, ctx?.newValues ?? null)

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      details: details ?? null,
      ip_address: ctx?.ipAddress ?? ipAddress ?? null,
      user_agent: ctx?.userAgent ?? userAgent ?? null,
      user_role: ctx?.userRole ?? null,
      session_id: ctx?.sessionId ?? null,
      entity_type: ctx?.entityType ?? null,
      entity_id: ctx?.entityId ?? null,
      old_data: ctx?.oldValues ?? null,
      new_data: ctx?.newValues ?? null,
      changes: effectiveChanges ?? null,
      status: ctx?.status ?? null,
      error_message: ctx?.errorMessage ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[audit] failed to write audit log', { action, userId, err })
  }
}
