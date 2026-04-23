-- =============================================================================
-- V2 SCHEMA: branches, support, approvals, teller sessions, RBAC tables,
-- audit log enhancements
-- =============================================================================
-- Additive / idempotent by design. NO existing columns, constraints, policies,
-- or rows are dropped. Every CREATE uses IF NOT EXISTS; every ALTER uses
-- ADD COLUMN IF NOT EXISTS; every policy drops then recreates.
--
-- PHASE 1 (this migration): schema only. New tables are seeded with defaults
-- where safe, but NO existing code is rewired yet — sacco_memberships.role
-- still drives every permission check. Phase 2 backfills roles/permissions
-- and refactors is_sacco_admin() to read from the new tables.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. audit_logs — add forensic columns
-- =============================================================================

-- Note: production audit_logs already has entity_type, entity_id, session_id,
-- old_data, new_data, changes, ip_address, user_agent, is_sensitive, sacco_id.
-- These were added in an unrecorded migration prior to this one. The ALTERs
-- below add only the NEW forensic columns and `details` for legacy callers.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_role     TEXT,
  ADD COLUMN IF NOT EXISTS details       JSONB,
  ADD COLUMN IF NOT EXISTS status        TEXT
    CHECK (status IS NULL OR status IN ('success', 'failure', 'warning')),
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_status_idx
  ON public.audit_logs (status, created_at DESC)
  WHERE status IS NOT NULL;

-- =============================================================================
-- 2. branches + branch_accounts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sacco_id      UUID NOT NULL REFERENCES public.saccos(id) ON DELETE CASCADE,
  branch_code   TEXT NOT NULL,
  branch_name   TEXT NOT NULL,
  location      TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  manager_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branches_sacco_code_key UNIQUE (sacco_id, branch_code)
);

CREATE INDEX IF NOT EXISTS branches_sacco_idx ON public.branches (sacco_id, is_active);
CREATE INDEX IF NOT EXISTS branches_manager_idx ON public.branches (manager_id)
  WHERE manager_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.branch_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  account_type  TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'mpesa', 'till')),
  balance       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branch_accounts_branch_type_key UNIQUE (branch_id, account_type)
);

-- =============================================================================
-- 3. RBAC: roles, permissions, role_permissions (schema only — Phase 2 wires)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource      TEXT NOT NULL,
  action        TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT permissions_resource_action_key UNIQUE (resource, action)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- Seed system roles (idempotent via ON CONFLICT)
INSERT INTO public.roles (name, description, is_system) VALUES
  ('super_admin',      'Full system access across all SACCOs',                 TRUE),
  ('admin',            'Administrative access within a SACCO',                 TRUE),
  ('manager',          'Management access, can approve loans and close sessions', TRUE),
  ('loan_officer',     'Loan processing, first-level approvals',               TRUE),
  ('teller',           'Cash handling and teller sessions',                    TRUE),
  ('auditor',          'Read-only access to all records and audit logs',       TRUE),
  ('customer_service', 'Member support, tickets, limited member updates',      TRUE),
  ('member',           'Regular SACCO member',                                 TRUE)
ON CONFLICT (name) DO NOTHING;

-- Seed canonical permissions
INSERT INTO public.permissions (resource, action, description) VALUES
  ('members',      'create',   'Create new members'),
  ('members',      'read',     'View member records'),
  ('members',      'update',   'Edit member records'),
  ('members',      'delete',   'Deactivate members'),
  ('members',      'verify',   'Verify/KYC members'),
  ('loans',        'create',   'Submit loan applications'),
  ('loans',        'read',     'View loan applications'),
  ('loans',        'update',   'Edit loan details'),
  ('loans',        'approve',  'Approve loan applications'),
  ('loans',        'disburse', 'Release loan funds'),
  ('loans',        'reject',   'Reject loan applications'),
  ('transactions', 'create',   'Create transactions'),
  ('transactions', 'read',     'View transactions'),
  ('transactions', 'approve',  'Approve high-value transactions'),
  ('transactions', 'reverse',  'Reverse/void transactions'),
  ('reports',      'read',     'View reports'),
  ('reports',      'export',   'Export reports'),
  ('settings',     'read',     'View system settings'),
  ('settings',     'update',   'Modify system settings'),
  ('audit',        'read',     'View audit logs'),
  ('audit',        'export',   'Export audit logs'),
  ('branches',     'manage',   'Create/edit branches'),
  ('tickets',      'create',   'Open support tickets'),
  ('tickets',      'read',     'View support tickets'),
  ('tickets',      'update',   'Update/resolve tickets'),
  ('tellers',      'open',     'Open a teller session'),
  ('tellers',      'close',    'Close a teller session'),
  ('tellers',      'audit',    'Audit closed teller sessions')
ON CONFLICT (resource, action) DO NOTHING;

-- Seed default role -> permission mappings
-- super_admin gets everything
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin: everything except super-admin-only (currently nothing marks that)
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- manager: all read/update + loan approve/disburse/reject + transactions approve + tellers close/audit + branches manage + tickets update
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'manager'
     AND (
       p.action IN ('read', 'update', 'export')
       OR (p.resource = 'loans' AND p.action IN ('approve', 'disburse', 'reject'))
       OR (p.resource = 'transactions' AND p.action IN ('approve'))
       OR (p.resource = 'tellers' AND p.action IN ('close', 'audit'))
       OR (p.resource = 'branches' AND p.action = 'manage')
       OR (p.resource = 'tickets' AND p.action IN ('update', 'create'))
     )
ON CONFLICT DO NOTHING;

-- loan_officer: loans CRUD (no approve above limit), members read/update, tickets, reports read
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'loan_officer'
     AND (
       (p.resource = 'loans' AND p.action IN ('create', 'read', 'update', 'approve', 'reject'))
       OR (p.resource = 'members' AND p.action IN ('read', 'update'))
       OR (p.resource = 'transactions' AND p.action = 'read')
       OR (p.resource = 'reports' AND p.action = 'read')
       OR (p.resource = 'tickets' AND p.action IN ('create', 'read', 'update'))
     )
ON CONFLICT DO NOTHING;

-- teller: transactions CRUD, members read, teller session open/close, tickets create
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'teller'
     AND (
       (p.resource = 'transactions' AND p.action IN ('create', 'read'))
       OR (p.resource = 'members' AND p.action = 'read')
       OR (p.resource = 'tellers' AND p.action IN ('open', 'close'))
       OR (p.resource = 'tickets' AND p.action = 'create')
     )
ON CONFLICT DO NOTHING;

-- auditor: every read + audit read/export
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'auditor'
     AND (p.action IN ('read', 'export') OR p.resource = 'audit')
ON CONFLICT DO NOTHING;

-- customer_service: members read/update, tickets full, transactions read
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'customer_service'
     AND (
       (p.resource = 'members' AND p.action IN ('read', 'update'))
       OR p.resource = 'tickets'
       OR (p.resource = 'transactions' AND p.action = 'read')
     )
ON CONFLICT DO NOTHING;

-- member: tickets.create/read (own)
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r, public.permissions p
   WHERE r.name = 'member'
     AND p.resource = 'tickets' AND p.action IN ('create', 'read')
ON CONFLICT DO NOTHING;

-- Phase 2 will add: sacco_memberships.role_id UUID REFERENCES roles(id),
-- backfill from existing role TEXT column, and refactor is_sacco_admin()
-- to check via role_permissions instead of role IN (...).

-- =============================================================================
-- 4. Approval workflows
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sacco_id      UUID REFERENCES public.saccos(id) ON DELETE CASCADE,
  workflow_name TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('loan', 'withdrawal', 'member_update', 'transaction_reversal')),
  min_amount    NUMERIC(14, 2),
  max_amount    NUMERIC(14, 2),
  requires_approval_count INTEGER NOT NULL DEFAULT 1 CHECK (requires_approval_count >= 1),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_workflows_sacco_name_key UNIQUE (sacco_id, workflow_name)
);

CREATE INDEX IF NOT EXISTS approval_workflows_entity_idx
  ON public.approval_workflows (entity_type, is_active);

CREATE TABLE IF NOT EXISTS public.approval_levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  level_number  INTEGER NOT NULL CHECK (level_number >= 1),
  required_role TEXT NOT NULL,
  max_amount    NUMERIC(14, 2),
  CONSTRAINT approval_levels_workflow_level_key UNIQUE (workflow_id, level_number)
);

CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         UUID REFERENCES public.approval_workflows(id) ON DELETE SET NULL,
  entity_type         TEXT NOT NULL,
  entity_id           UUID NOT NULL,
  amount              NUMERIC(14, 2),
  requested_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_level       INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'cancelled')),
  approvals_received  JSONB NOT NULL DEFAULT '[]'::jsonb,
  rejected_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason    TEXT,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_approvals_entity_idx
  ON public.pending_approvals (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS pending_approvals_status_idx
  ON public.pending_approvals (status, current_level, created_at DESC)
  WHERE status = 'pending';

-- Seed default loan workflow thresholds (global, sacco_id NULL)
INSERT INTO public.approval_workflows (workflow_name, entity_type, min_amount, max_amount, requires_approval_count)
VALUES
  ('Small Loan',  'loan', 0,       100000,  1),
  ('Medium Loan', 'loan', 100001,  500000,  2),
  ('Large Loan',  'loan', 500001,  1000000, 3),
  ('Jumbo Loan',  'loan', 1000001, NULL,    4),
  ('Large Withdrawal',  'withdrawal', 50001,  250000, 1),
  ('Jumbo Withdrawal',  'withdrawal', 250001, NULL,   2)
ON CONFLICT (sacco_id, workflow_name) DO NOTHING;

-- Seed approval levels for each
WITH wf AS (
  SELECT id, workflow_name FROM public.approval_workflows WHERE sacco_id IS NULL
)
INSERT INTO public.approval_levels (workflow_id, level_number, required_role, max_amount)
SELECT wf.id, lv.level_number, lv.required_role, lv.max_amount
FROM wf
JOIN LATERAL (VALUES
  ('Small Loan',  1, 'loan_officer', 100000),
  ('Medium Loan', 1, 'loan_officer', 250000),
  ('Medium Loan', 2, 'manager',      500000),
  ('Large Loan',  1, 'loan_officer', 250000),
  ('Large Loan',  2, 'manager',      750000),
  ('Large Loan',  3, 'admin',       1000000),
  ('Jumbo Loan',  1, 'loan_officer', 250000),
  ('Jumbo Loan',  2, 'manager',      750000),
  ('Jumbo Loan',  3, 'admin',      5000000),
  ('Jumbo Loan',  4, 'super_admin',  NULL),
  ('Large Withdrawal', 1, 'manager', 250000),
  ('Jumbo Withdrawal', 1, 'manager', 500000),
  ('Jumbo Withdrawal', 2, 'admin',   NULL)
) AS lv(workflow_name, level_number, required_role, max_amount)
  ON lv.workflow_name = wf.workflow_name
ON CONFLICT (workflow_id, level_number) DO NOTHING;

-- =============================================================================
-- 5. Support tickets
-- =============================================================================

-- Human-readable ticket number sequence
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   TEXT NOT NULL UNIQUE,
  member_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  category        TEXT NOT NULL CHECK (category IN ('account', 'loan', 'transaction', 'technical', 'general', 'complaint')),
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_member_idx ON public.support_tickets (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON public.support_tickets (assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, priority, created_at DESC);

-- Trigger to assign TKT-000001 style numbers
CREATE OR REPLACE FUNCTION public.set_support_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || LPAD(nextval('public.support_ticket_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_support_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_set_support_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_ticket_number();

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_staff        BOOLEAN NOT NULL DEFAULT FALSE,
  comment         TEXT NOT NULL,
  is_internal     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx
  ON public.ticket_comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  comment_id      UUID REFERENCES public.ticket_comments(id) ON DELETE SET NULL,
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       INTEGER,
  mime_type       TEXT,
  uploaded_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx
  ON public.ticket_attachments (ticket_id);

-- Auto-update updated_at on support_tickets
CREATE OR REPLACE FUNCTION public.touch_support_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_touch_support_ticket
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_support_ticket_updated_at();

-- =============================================================================
-- 6. Teller sessions + cash denominations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.teller_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  branch_id                 UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  opening_time              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closing_time              TIMESTAMPTZ,
  opening_balance           NUMERIC(14, 2) NOT NULL,
  closing_balance           NUMERIC(14, 2),
  expected_closing_balance  NUMERIC(14, 2),
  cash_received             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cash_disbursed            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  difference                NUMERIC(14, 2),
  status                    TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'suspended', 'audited', 'disputed')),
  notes                     TEXT,
  closed_by                 UUID REFERENCES public.users(id) ON DELETE SET NULL,
  audited_by                UUID REFERENCES public.users(id) ON DELETE SET NULL,
  audited_at                TIMESTAMPTZ,
  audit_notes               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teller_sessions_teller_idx
  ON public.teller_sessions (teller_id, status, opening_time DESC);
CREATE INDEX IF NOT EXISTS teller_sessions_branch_idx
  ON public.teller_sessions (branch_id, opening_time DESC)
  WHERE branch_id IS NOT NULL;

-- Guarantee at most ONE open session per teller
CREATE UNIQUE INDEX IF NOT EXISTS teller_sessions_one_open_per_teller
  ON public.teller_sessions (teller_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.cash_denominations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_session_id  UUID NOT NULL REFERENCES public.teller_sessions(id) ON DELETE CASCADE,
  phase              TEXT NOT NULL CHECK (phase IN ('opening', 'closing')),
  denomination       INTEGER NOT NULL CHECK (denomination > 0),
  count              INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cash_denominations_session_phase_denom_key
    UNIQUE (teller_session_id, phase, denomination)
);

CREATE INDEX IF NOT EXISTS cash_denominations_session_idx
  ON public.cash_denominations (teller_session_id, phase);

-- =============================================================================
-- 7. RLS — enable + policies for all new tables
--    Admin access uses existing public.is_sacco_admin() helper (Phase 2 will
--    refactor that helper to consult role_permissions; policies don't change).
-- =============================================================================

ALTER TABLE public.branches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_levels     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_approvals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teller_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_denominations  ENABLE ROW LEVEL SECURITY;

-- Branches
DROP POLICY IF EXISTS "Members read active branches" ON public.branches;
CREATE POLICY "Members read active branches" ON public.branches FOR SELECT
  USING (is_active = TRUE OR public.is_sacco_admin());

DROP POLICY IF EXISTS "Admins manage branches" ON public.branches;
CREATE POLICY "Admins manage branches" ON public.branches FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

DROP POLICY IF EXISTS "Admins manage branch accounts" ON public.branch_accounts;
CREATE POLICY "Admins manage branch accounts" ON public.branch_accounts FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

-- Roles / permissions (readable by everyone authenticated, writable by admins)
DROP POLICY IF EXISTS "Anyone reads roles" ON public.roles;
CREATE POLICY "Anyone reads roles" ON public.roles FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage roles" ON public.roles;
CREATE POLICY "Admins manage roles" ON public.roles FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

DROP POLICY IF EXISTS "Anyone reads permissions" ON public.permissions;
CREATE POLICY "Anyone reads permissions" ON public.permissions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage permissions" ON public.permissions;
CREATE POLICY "Admins manage permissions" ON public.permissions FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

DROP POLICY IF EXISTS "Anyone reads role permissions" ON public.role_permissions;
CREATE POLICY "Anyone reads role permissions" ON public.role_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins manage role permissions" ON public.role_permissions FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

-- Approval tables (admin-only)
DROP POLICY IF EXISTS "Admins manage workflows" ON public.approval_workflows;
CREATE POLICY "Admins manage workflows" ON public.approval_workflows FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

DROP POLICY IF EXISTS "Admins manage levels" ON public.approval_levels;
CREATE POLICY "Admins manage levels" ON public.approval_levels FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

DROP POLICY IF EXISTS "Admins manage pending approvals" ON public.pending_approvals;
CREATE POLICY "Admins manage pending approvals" ON public.pending_approvals FOR ALL
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

DROP POLICY IF EXISTS "Requester reads own approvals" ON public.pending_approvals;
CREATE POLICY "Requester reads own approvals" ON public.pending_approvals FOR SELECT
  USING (requested_by = auth.uid() OR public.is_sacco_admin());

-- Support tickets: members see own, staff see all
DROP POLICY IF EXISTS "Members read own tickets" ON public.support_tickets;
CREATE POLICY "Members read own tickets" ON public.support_tickets FOR SELECT
  USING (member_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS "Members open tickets" ON public.support_tickets;
CREATE POLICY "Members open tickets" ON public.support_tickets FOR INSERT
  WITH CHECK (member_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS "Staff update tickets" ON public.support_tickets;
CREATE POLICY "Staff update tickets" ON public.support_tickets FOR UPDATE
  USING (public.is_sacco_admin()) WITH CHECK (public.is_sacco_admin());

-- Ticket comments: visible to ticket participants; internal staff notes hidden from members
DROP POLICY IF EXISTS "Comments read participants" ON public.ticket_comments;
CREATE POLICY "Comments read participants" ON public.ticket_comments FOR SELECT
  USING (
    public.is_sacco_admin()
    OR (
      is_internal = FALSE
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_comments.ticket_id
          AND t.member_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Participants add comments" ON public.ticket_comments;
CREATE POLICY "Participants add comments" ON public.ticket_comments FOR INSERT
  WITH CHECK (
    public.is_sacco_admin()
    OR (
      is_internal = FALSE
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_comments.ticket_id
          AND t.member_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Attachments read participants" ON public.ticket_attachments;
CREATE POLICY "Attachments read participants" ON public.ticket_attachments FOR SELECT
  USING (
    public.is_sacco_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_attachments.ticket_id
        AND t.member_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants upload attachments" ON public.ticket_attachments;
CREATE POLICY "Participants upload attachments" ON public.ticket_attachments FOR INSERT
  WITH CHECK (
    public.is_sacco_admin()
    OR (
      uploaded_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_attachments.ticket_id
          AND t.member_id = auth.uid()
      )
    )
  );

-- Teller sessions: teller sees own, admin sees all
DROP POLICY IF EXISTS "Teller reads own sessions" ON public.teller_sessions;
CREATE POLICY "Teller reads own sessions" ON public.teller_sessions FOR SELECT
  USING (teller_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS "Teller creates own sessions" ON public.teller_sessions;
CREATE POLICY "Teller creates own sessions" ON public.teller_sessions FOR INSERT
  WITH CHECK (teller_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS "Teller updates own open session" ON public.teller_sessions;
CREATE POLICY "Teller updates own open session" ON public.teller_sessions FOR UPDATE
  USING (
    (teller_id = auth.uid() AND status = 'open')
    OR public.is_sacco_admin()
  )
  WITH CHECK (
    (teller_id = auth.uid() AND status IN ('open', 'closed'))
    OR public.is_sacco_admin()
  );

DROP POLICY IF EXISTS "Teller reads own denoms" ON public.cash_denominations;
CREATE POLICY "Teller reads own denoms" ON public.cash_denominations FOR SELECT
  USING (
    public.is_sacco_admin()
    OR EXISTS (
      SELECT 1 FROM public.teller_sessions ts
      WHERE ts.id = cash_denominations.teller_session_id
        AND ts.teller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teller writes own denoms" ON public.cash_denominations;
CREATE POLICY "Teller writes own denoms" ON public.cash_denominations FOR ALL
  USING (
    public.is_sacco_admin()
    OR EXISTS (
      SELECT 1 FROM public.teller_sessions ts
      WHERE ts.id = cash_denominations.teller_session_id
        AND ts.teller_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_sacco_admin()
    OR EXISTS (
      SELECT 1 FROM public.teller_sessions ts
      WHERE ts.id = cash_denominations.teller_session_id
        AND ts.teller_id = auth.uid()
    )
  );

-- =============================================================================
-- 8. Grants (match existing pattern from 20260422_restore_default_grants.sql)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_accounts     TO authenticated;
GRANT SELECT                          ON public.roles              TO authenticated, anon;
GRANT SELECT                          ON public.permissions        TO authenticated, anon;
GRANT SELECT                          ON public.role_permissions   TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_workflows  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_levels     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_approvals   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_attachments  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teller_sessions     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_denominations  TO authenticated;

GRANT ALL ON public.branches, public.branch_accounts,
           public.roles, public.permissions, public.role_permissions,
           public.approval_workflows, public.approval_levels, public.pending_approvals,
           public.support_tickets, public.ticket_comments, public.ticket_attachments,
           public.teller_sessions, public.cash_denominations
  TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_seq TO authenticated, service_role;

COMMIT;
