-- =====================================================================
-- 20260424_age_rules_and_family_links.sql
--
-- V1.7 — Configurable business rules + family account links
--
-- This migration adds two features:
--
--   A. loan_rules_by_age — age-bracketed loan terms (requires guarantors,
--      max instant loan, interest rate). See the REGULATORY WARNING at
--      the top of section A before enabling this in a jurisdiction that
--      prohibits age-based lending decisions.
--
--   B. family_links — consented bidirectional links between users that
--      grant opt-in guarantor eligibility and opt-in balance visibility.
--
-- Idempotent: safe to re-run.
-- =====================================================================


-- =====================================================================
-- A. loan_rules_by_age
-- =====================================================================
--
-- REGULATORY WARNING
-- ------------------
-- Age-based differentiation of loan terms may constitute prohibited
-- discrimination in lending under Kenya's Consumer Protection Act (2012)
-- and SASRA's SACCO Societies Act regulations, and similar statutes in
-- most jurisdictions. Running a loan decision engine that gives younger
-- members cheaper credit purely because of their age — with no
-- underlying risk justification — is an audit finding waiting to happen.
--
-- This table was shipped at the product owner's explicit request with
-- acknowledged compliance risk. Safer alternatives already in the
-- schema:
--   * public.instant_loan_rules      (JSONB, drives off social score)
--   * public.social_credit_scores    (repayment history, tenure, etc.)
--
-- If your compliance team objects, flip `is_active = FALSE` on every
-- row in this table and the age-aware RPCs below will return NULL
-- (callers should then fall back to instant_loan_rules).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.loan_rules_by_age (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL sacco_id = global default rule. Per-sacco rows override.
  sacco_id UUID NULL REFERENCES public.saccos(id) ON DELETE CASCADE,
  age_min INTEGER NOT NULL CHECK (age_min >= 0 AND age_min <= 150),
  age_max INTEGER NOT NULL CHECK (age_max >= 0 AND age_max <= 150),
  requires_guarantors BOOLEAN NOT NULL DEFAULT FALSE,
  min_guarantors INTEGER NOT NULL DEFAULT 0 CHECK (min_guarantors >= 0 AND min_guarantors <= 10),
  max_instant_loan NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (max_instant_loan >= 0),
  interest_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0 AND interest_rate <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (age_min <= age_max)
);

CREATE INDEX IF NOT EXISTS loan_rules_by_age_lookup_idx
  ON public.loan_rules_by_age(sacco_id, is_active, age_min, age_max);

-- Prevent the same (sacco, age_min, age_max) tuple being seeded twice
CREATE UNIQUE INDEX IF NOT EXISTS loan_rules_by_age_unique_band
  ON public.loan_rules_by_age(COALESCE(sacco_id, '00000000-0000-0000-0000-000000000000'::uuid), age_min, age_max);

-- Seed three global default bands (sacco_id IS NULL).
-- These reproduce the values in the product spec verbatim.
INSERT INTO public.loan_rules_by_age (sacco_id, age_min, age_max, requires_guarantors, min_guarantors, max_instant_loan, interest_rate, notes)
VALUES
  (NULL, 18, 35, FALSE, 0, 100000, 10.00, 'Default band 1 (seed). Reviewable by compliance.'),
  (NULL, 36, 50, TRUE,  1,  50000, 12.00, 'Default band 2 (seed). Reviewable by compliance.'),
  (NULL, 51, 99, TRUE,  2,  25000, 15.00, 'Default band 3 (seed). Reviewable by compliance.')
ON CONFLICT DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_loan_rules_by_age()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_loan_rules_by_age ON public.loan_rules_by_age;
CREATE TRIGGER trg_touch_loan_rules_by_age
BEFORE UPDATE ON public.loan_rules_by_age
FOR EACH ROW EXECUTE FUNCTION public._touch_loan_rules_by_age();

-- RLS: members can read active rules for their sacco (or global). Only
-- admins can write. Admin check reuses the existing helper if present;
-- otherwise we fall back to matching auth.uid() to the saccos.owner — no
-- such column exists, so we simply require service_role for writes.
ALTER TABLE public.loan_rules_by_age ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_rules_by_age_read ON public.loan_rules_by_age;
CREATE POLICY loan_rules_by_age_read ON public.loan_rules_by_age
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS loan_rules_by_age_service_write ON public.loan_rules_by_age;
CREATE POLICY loan_rules_by_age_service_write ON public.loan_rules_by_age
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT ON public.loan_rules_by_age TO authenticated;

-- ---------------------------------------------------------------------
-- A.1 get_applicable_loan_rule(p_user_id, p_sacco_id)
--     Resolves the single applicable rule for a user.
--     Preference: sacco-specific rule over global default. If age is
--     missing on the user row, returns NULL (caller should fall back to
--     instant_loan_rules instead of silently picking the youngest band).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_applicable_loan_rule(
  p_user_id UUID,
  p_sacco_id UUID DEFAULT NULL
)
RETURNS TABLE (
  rule_id UUID,
  sacco_id UUID,
  age_min INTEGER,
  age_max INTEGER,
  user_age INTEGER,
  requires_guarantors BOOLEAN,
  min_guarantors INTEGER,
  max_instant_loan NUMERIC,
  interest_rate NUMERIC,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dob DATE;
  v_age INTEGER;
BEGIN
  SELECT date_of_birth INTO v_dob FROM public.users WHERE id = p_user_id;
  IF v_dob IS NULL THEN
    RETURN;  -- no DOB, no rule applicable
  END IF;

  v_age := DATE_PART('year', AGE(v_dob))::INTEGER;

  -- Prefer a sacco-specific active rule that covers this age
  RETURN QUERY
    SELECT r.id, r.sacco_id, r.age_min, r.age_max,
           v_age, r.requires_guarantors, r.min_guarantors,
           r.max_instant_loan, r.interest_rate,
           CASE WHEN r.sacco_id IS NULL THEN 'global' ELSE 'sacco' END
    FROM public.loan_rules_by_age r
    WHERE r.is_active = TRUE
      AND v_age BETWEEN r.age_min AND r.age_max
      AND (r.sacco_id = p_sacco_id OR r.sacco_id IS NULL)
    ORDER BY (r.sacco_id IS NULL) ASC, r.age_min ASC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_applicable_loan_rule(UUID, UUID) TO authenticated;


-- =====================================================================
-- B. family_links
-- =====================================================================
--
-- A consented, directional link between two users. `from_user_id` is
-- the initiator (they press "invite"); `to_user_id` is the invitee.
-- The link only grants any permissions once `status = 'accepted'`.
--
-- Relationship types (capped via CHECK):
--   parent | child | guardian | spouse | sibling | dependant
--
-- Permissions (boolean carveouts, both default OFF):
--   can_guarantee     — linked user auto-surfaces as a guarantor option
--   can_view_balance  — linked user may call get_family_balance()
--
-- We deliberately do NOT modify member_accounts RLS to broaden SELECT.
-- Instead, cross-user balance reads go through a SECURITY DEFINER
-- RPC that explicitly checks for an accepted link with
-- can_view_balance=TRUE, so the audit trail is simple and the blast
-- radius of any RLS mistake is small.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.family_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL
    CHECK (relationship IN ('parent','child','guardian','spouse','sibling','dependant')),
  can_guarantee BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_balance BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','revoked')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (from_user_id <> to_user_id)
);

-- One active request per ordered pair. Once declined/revoked you can
-- re-invite by creating a new row (old one stays for audit).
CREATE UNIQUE INDEX IF NOT EXISTS family_links_one_active_per_pair
  ON public.family_links(from_user_id, to_user_id)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS family_links_from_idx ON public.family_links(from_user_id, status);
CREATE INDEX IF NOT EXISTS family_links_to_idx   ON public.family_links(to_user_id,   status);

CREATE OR REPLACE FUNCTION public._touch_family_links()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_family_links ON public.family_links;
CREATE TRIGGER trg_touch_family_links
BEFORE UPDATE ON public.family_links
FOR EACH ROW EXECUTE FUNCTION public._touch_family_links();

ALTER TABLE public.family_links ENABLE ROW LEVEL SECURITY;

-- Either party can see a link they're part of.
DROP POLICY IF EXISTS family_links_select_own ON public.family_links;
CREATE POLICY family_links_select_own ON public.family_links
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Only the initiator can INSERT, and only as pending.
DROP POLICY IF EXISTS family_links_insert_from ON public.family_links;
CREATE POLICY family_links_insert_from ON public.family_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id AND status = 'pending');

-- Updates are handled through RPCs (SECURITY DEFINER below), which
-- enforce the correct actor for each state transition. We still need
-- an update policy for the RPC's implicit caller check to pass when
-- auth.uid() is used; SECURITY DEFINER runs as postgres so it bypasses
-- RLS, but keep a narrow policy for any direct updates.
DROP POLICY IF EXISTS family_links_update_either ON public.family_links;
CREATE POLICY family_links_update_either ON public.family_links
  FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Service role does anything (admin / support tools)
DROP POLICY IF EXISTS family_links_service ON public.family_links;
CREATE POLICY family_links_service ON public.family_links
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.family_links TO authenticated;


-- ---------------------------------------------------------------------
-- B.1 create_family_link — invite another user
--     Caller is implicitly from_user_id (auth.uid()).
--     p_identifier is either the target user's phone OR email OR
--     member_number. We resolve to a user_id inside the RPC.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_link(
  p_identifier TEXT,
  p_relationship TEXT,
  p_can_guarantee BOOLEAN DEFAULT FALSE,
  p_can_view_balance BOOLEAN DEFAULT FALSE
)
RETURNS public.family_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from UUID := auth.uid();
  v_to UUID;
  v_link public.family_links;
  v_no_plus TEXT;
  v_with_plus TEXT;
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_relationship NOT IN ('parent','child','guardian','spouse','sibling','dependant') THEN
    RAISE EXCEPTION 'invalid relationship: %', p_relationship USING ERRCODE = '22023';
  END IF;

  v_no_plus   := CASE WHEN p_identifier LIKE '+%' THEN substring(p_identifier FROM 2) ELSE p_identifier END;
  v_with_plus := CASE WHEN p_identifier LIKE '+%' THEN p_identifier ELSE '+' || p_identifier END;

  -- Resolve target: email, phone (with or without +), or member_number
  SELECT u.id INTO v_to
  FROM public.users u
  LEFT JOIN public.sacco_memberships sm ON sm.user_id = u.id
  WHERE u.email = p_identifier
     OR u.phone IN (p_identifier, v_no_plus, v_with_plus)
     OR sm.member_number = p_identifier
  LIMIT 1;

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'no user found for identifier %', p_identifier USING ERRCODE = 'P0002';
  END IF;

  IF v_to = v_from THEN
    RAISE EXCEPTION 'cannot link to yourself' USING ERRCODE = '22023';
  END IF;

  -- Exclusion constraint will reject an active pending/accepted duplicate
  INSERT INTO public.family_links (
    from_user_id, to_user_id, relationship,
    can_guarantee, can_view_balance, status
  ) VALUES (
    v_from, v_to, p_relationship,
    COALESCE(p_can_guarantee, FALSE),
    COALESCE(p_can_view_balance, FALSE),
    'pending'
  )
  RETURNING * INTO v_link;

  RETURN v_link;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_family_link(TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;


-- ---------------------------------------------------------------------
-- B.2 respond_to_family_link — accept or decline. Only the invitee.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_family_link(
  p_link_id UUID,
  p_accept BOOLEAN
)
RETURNS public.family_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_link public.family_links;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_link FROM public.family_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_link.to_user_id <> v_user THEN
    RAISE EXCEPTION 'only the invitee may respond' USING ERRCODE = '42501';
  END IF;

  IF v_link.status <> 'pending' THEN
    RAISE EXCEPTION 'link is not pending (current: %)', v_link.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.family_links
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      responded_at = NOW()
  WHERE id = p_link_id
  RETURNING * INTO v_link;

  RETURN v_link;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_family_link(UUID, BOOLEAN) TO authenticated;


-- ---------------------------------------------------------------------
-- B.3 revoke_family_link — either party can revoke an accepted link
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_family_link(p_link_id UUID)
RETURNS public.family_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_link public.family_links;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_link FROM public.family_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_link.from_user_id <> v_user AND v_link.to_user_id <> v_user THEN
    RAISE EXCEPTION 'not a party to this link' USING ERRCODE = '42501';
  END IF;

  IF v_link.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'link is already % — nothing to revoke', v_link.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.family_links
  SET status = 'revoked',
      revoked_at = NOW(),
      revoked_by = v_user
  WHERE id = p_link_id
  RETURNING * INTO v_link;

  RETURN v_link;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_family_link(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- B.4 get_family_balance — permissioned cross-user balance read
--
-- Caller can view the target user's savings + shares ONLY if there is
-- an accepted family_link between the two (in either direction) with
-- can_view_balance = TRUE. Returns NULL when disallowed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_family_balance(p_target_user_id UUID)
RETURNS TABLE (
  full_name TEXT,
  sacco_id UUID,
  savings NUMERIC,
  shares NUMERIC,
  loan_balance NUMERIC,
  relationship TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_relationship TEXT;
  v_allowed BOOLEAN := FALSE;
  v_membership_id UUID;
  v_sacco_id UUID;
  v_name TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_user = p_target_user_id THEN
    -- Trivially allowed — caller is viewing their own account.
    v_allowed := TRUE;
    v_relationship := 'self';
  ELSE
    SELECT fl.relationship
      INTO v_relationship
    FROM public.family_links fl
    WHERE fl.status = 'accepted'
      AND fl.can_view_balance = TRUE
      AND (
        (fl.from_user_id = v_user AND fl.to_user_id = p_target_user_id)
        OR (fl.to_user_id = v_user AND fl.from_user_id = p_target_user_id)
      )
    LIMIT 1;

    v_allowed := v_relationship IS NOT NULL;
  END IF;

  IF NOT v_allowed THEN
    RETURN;
  END IF;

  SELECT u.full_name INTO v_name FROM public.users u WHERE u.id = p_target_user_id;

  SELECT sm.id, sm.sacco_id
    INTO v_membership_id, v_sacco_id
  FROM public.sacco_memberships sm
  WHERE sm.user_id = p_target_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN QUERY SELECT v_name, NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, v_relationship;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_name,
    v_sacco_id,
    COALESCE(SUM(CASE WHEN ma.account_type = 'savings' THEN ma.balance ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN ma.account_type = 'shares'  THEN ma.balance ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN ma.account_type = 'loan'    THEN ma.balance ELSE 0 END), 0)::NUMERIC,
    v_relationship
  FROM public.member_accounts ma
  WHERE ma.sacco_membership_id = v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_balance(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- B.5 list_eligible_family_guarantors — for the loan application UI
--
-- Returns users who have consented to guarantee this caller (accepted
-- family_link with can_guarantee = TRUE). Does NOT return balance info
-- — that requires a separate can_view_balance grant per target.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_eligible_family_guarantors()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  relationship TEXT,
  phone TEXT,
  link_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    other.id,
    other.full_name,
    fl.relationship,
    other.phone,
    fl.id
  FROM public.family_links fl
  JOIN public.users other
    ON other.id = CASE
                    WHEN fl.from_user_id = v_user THEN fl.to_user_id
                    ELSE fl.from_user_id
                  END
  WHERE fl.status = 'accepted'
    AND fl.can_guarantee = TRUE
    AND (fl.from_user_id = v_user OR fl.to_user_id = v_user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_eligible_family_guarantors() TO authenticated;
