import { createClient } from '@/lib/supabase/server'

export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  TRANSACTION = 'transaction',
  LOAN_APPLY = 'loan_apply',
  LOAN_APPROVE = 'loan_approve',
  MEMBER_CREATE = 'member_create',
  MEMBER_UPDATE = 'member_update',
  SETTINGS_CHANGE = 'settings_change',
}

export async function logAudit(
  userId: string,
  action: AuditAction,
  details: any,
  ipAddress?: string,
  userAgent?: string,
) {
  const supabase = await createClient()

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    details,
    ip_address: ipAddress,
    user_agent: userAgent ?? null,
    created_at: new Date().toISOString(),
  })
}
