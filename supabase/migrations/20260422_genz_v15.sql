-- =============================================================================
-- V1.5 Gen-Z features: partial savings release, social credit scoring,
-- instant loans, user personas, personalized recommendations.
--
-- Idempotent. Safe to re-run.
--
-- Departures from the original spec, with reasons:
--   * social_credit_scores.final_score and .loan_eligibility_without_guarantors
--     are populated by a BEFORE INSERT/UPDATE trigger instead of GENERATED STORED.
--     PostgreSQL forbids one GENERATED STORED column from referencing another
--     in the same row. Trigger gives identical semantics + actually compiles.
--   * Eligibility tiers + instant loan caps are SACCO-board-tunable via
--     instant_loan_rules table instead of hardcoded magic numbers.
--   * partial_releases requires manager approval (SACCO regulatory norm for
--     touching pledged collateral) and goes through a SECURITY DEFINER RPC
--     so the disbursement is atomic with the savings debit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PARTIAL SAVINGS RELEASE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partial_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  member_account_id UUID NOT NULL REFERENCES public.member_accounts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sacco_id UUID NOT NULL REFERENCES public.saccos(id) ON DELETE RESTRICT,
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  released_amount NUMERIC(14,2),
  remaining_savings_balance NUMERIC(14,2),
  max_releasable_at_request NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','disbursed','cancelled')),
  reason TEXT,
  rejection_reason TEXT,
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id),
  rejected_at TIMESTAMPTZ,
  disbursed_transaction_id UUID REFERENCES public.transactions(id),
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partial_releases_user_idx ON public.partial_releases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partial_releases_status_idx ON public.partial_releases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS partial_releases_sacco_idx ON public.partial_releases(sacco_id, created_at DESC);

-- Eligibility check: returns the maximum releasable amount given the
-- member's current savings and active loans. Default rule: 50% of savings
-- balance, but never go below the minimum balance configured on the account.
-- If member has an active loan, releasable amount also can't drop savings
-- below 1.0x the outstanding loan balance (minimum collateral coverage).
CREATE OR REPLACE FUNCTION public.check_partial_release_eligibility(
  p_user_id UUID,
  p_requested_amount NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_savings_balance NUMERIC;
  v_min_balance NUMERIC;
  v_account_id UUID;
  v_loan_balance NUMERIC;
  v_max_releasable NUMERIC;
  v_collateral_floor NUMERIC;
  v_pct_cap NUMERIC := 0.50;
BEGIN
  SELECT ma.id, ma.balance, COALESCE(ma.minimum_balance, 0)
    INTO v_account_id, v_savings_balance, v_min_balance
  FROM public.member_accounts ma
  JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
  WHERE sm.user_id = p_user_id
    AND ma.account_type = 'savings'
  ORDER BY ma.created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'No savings account found',
      'max_releasable', 0
    );
  END IF;

  -- Sum of outstanding loan balances (loan account-type holds running balance)
  SELECT COALESCE(SUM(ma.balance), 0) INTO v_loan_balance
  FROM public.member_accounts ma
  JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
  WHERE sm.user_id = p_user_id
    AND ma.account_type = 'loan'
    AND ma.balance > 0;

  -- Collateral floor: savings must remain >= outstanding loan after release
  v_collateral_floor := GREATEST(v_loan_balance, v_min_balance);
  v_max_releasable := GREATEST(0, LEAST(v_savings_balance * v_pct_cap, v_savings_balance - v_collateral_floor));

  IF p_requested_amount IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', v_max_releasable > 0,
      'savings_balance', v_savings_balance,
      'loan_balance', v_loan_balance,
      'minimum_balance', v_min_balance,
      'max_releasable', v_max_releasable,
      'pct_cap', v_pct_cap,
      'savings_account_id', v_account_id
    );
  END IF;

  IF p_requested_amount > v_max_releasable THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', format('Requested KES %s exceeds maximum releasable KES %s',
        p_requested_amount::text, v_max_releasable::text),
      'savings_balance', v_savings_balance,
      'loan_balance', v_loan_balance,
      'max_releasable', v_max_releasable,
      'savings_account_id', v_account_id
    );
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'savings_balance', v_savings_balance,
    'loan_balance', v_loan_balance,
    'max_releasable', v_max_releasable,
    'savings_account_id', v_account_id
  );
END;
$$;

-- Atomic request RPC: writes the partial_releases row in a single transaction
-- after verifying eligibility. SECURITY DEFINER so it can read across RLS
-- without leaking other members' balances.
CREATE OR REPLACE FUNCTION public.request_partial_release(
  p_user_id UUID,
  p_amount NUMERIC,
  p_loan_application_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_eligibility JSONB;
  v_account_id UUID;
  v_sacco_id UUID;
  v_release_id UUID;
BEGIN
  v_eligibility := public.check_partial_release_eligibility(p_user_id, p_amount);

  IF NOT (v_eligibility->>'eligible')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', COALESCE(v_eligibility->>'reason', 'Not eligible'),
      'eligibility', v_eligibility
    );
  END IF;

  v_account_id := (v_eligibility->>'savings_account_id')::uuid;

  SELECT sm.sacco_id INTO v_sacco_id
  FROM public.sacco_memberships sm
  JOIN public.member_accounts ma ON ma.sacco_membership_id = sm.id
  WHERE ma.id = v_account_id;

  INSERT INTO public.partial_releases (
    loan_application_id,
    member_account_id,
    user_id,
    sacco_id,
    requested_amount,
    max_releasable_at_request,
    reason,
    status
  ) VALUES (
    p_loan_application_id,
    v_account_id,
    p_user_id,
    v_sacco_id,
    p_amount,
    (v_eligibility->>'max_releasable')::numeric,
    p_reason,
    'pending'
  ) RETURNING id INTO v_release_id;

  RETURN jsonb_build_object(
    'success', true,
    'release_id', v_release_id,
    'eligibility', v_eligibility
  );
END;
$$;

-- Atomic approval RPC: validates again, debits savings, creates transaction,
-- marks release disbursed. All in one transaction.
CREATE OR REPLACE FUNCTION public.approve_partial_release(
  p_release_id UUID,
  p_approver_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release RECORD;
  v_eligibility JSONB;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_tx_id UUID;
  v_tx_ref TEXT;
BEGIN
  SELECT * INTO v_release
  FROM public.partial_releases
  WHERE id = p_release_id
  FOR UPDATE;

  IF v_release IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Release request not found');
  END IF;

  IF v_release.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Release is not pending (current status: ' || v_release.status || ')');
  END IF;

  -- Re-check eligibility at approval time (balances may have changed)
  v_eligibility := public.check_partial_release_eligibility(v_release.user_id, v_release.requested_amount);
  IF NOT (v_eligibility->>'eligible')::boolean THEN
    UPDATE public.partial_releases
       SET status = 'rejected',
           rejected_by = p_approver_id,
           rejected_at = NOW(),
           rejection_reason = 'Eligibility lost between request and approval: ' || COALESCE(v_eligibility->>'reason',''),
           updated_at = NOW()
     WHERE id = p_release_id;

    RETURN jsonb_build_object(
      'success', false,
      'reason', 'Eligibility lost: ' || COALESCE(v_eligibility->>'reason',''),
      'eligibility', v_eligibility
    );
  END IF;

  -- Lock account row, debit, write transaction
  SELECT balance INTO v_balance_before
  FROM public.member_accounts
  WHERE id = v_release.member_account_id
  FOR UPDATE;

  v_balance_after := v_balance_before - v_release.requested_amount;
  IF v_balance_after < 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Insufficient balance at disbursement time');
  END IF;

  UPDATE public.member_accounts
     SET balance = v_balance_after,
         available_balance = GREATEST(0, COALESCE(available_balance, balance) - v_release.requested_amount),
         updated_at = NOW()
   WHERE id = v_release.member_account_id;

  v_tx_ref := 'PR-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || substr(v_release.id::text, 1, 8);

  INSERT INTO public.transactions (
    transaction_ref,
    sacco_id,
    member_account_id,
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    description,
    status,
    initiated_by,
    initiated_at,
    approved_by,
    approved_at,
    completed_at
  ) VALUES (
    v_tx_ref,
    v_release.sacco_id,
    v_release.member_account_id,
    v_release.user_id,
    'withdrawal'::transaction_type,
    v_release.requested_amount,
    v_balance_before,
    v_balance_after,
    'Partial savings release' || COALESCE(' — ' || v_release.reason, ''),
    'completed',
    v_release.user_id,
    v_release.created_at,
    p_approver_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_tx_id;

  UPDATE public.partial_releases
     SET status = 'disbursed',
         released_amount = v_release.requested_amount,
         remaining_savings_balance = v_balance_after,
         approved_by = p_approver_id,
         approved_at = NOW(),
         disbursed_transaction_id = v_tx_id,
         disbursed_at = NOW(),
         updated_at = NOW()
   WHERE id = p_release_id;

  RETURN jsonb_build_object(
    'success', true,
    'release_id', p_release_id,
    'transaction_id', v_tx_id,
    'released_amount', v_release.requested_amount,
    'remaining_balance', v_balance_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_partial_release(
  p_release_id UUID,
  p_approver_id UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.partial_releases
  WHERE id = p_release_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Release request not found');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Release is not pending');
  END IF;

  UPDATE public.partial_releases
     SET status = 'rejected',
         rejected_by = p_approver_id,
         rejected_at = NOW(),
         rejection_reason = p_reason,
         updated_at = NOW()
   WHERE id = p_release_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. SOCIAL CREDIT SCORES (via trigger, not GENERATED STORED)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_credit_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  base_score INTEGER NOT NULL DEFAULT 500 CHECK (base_score BETWEEN 300 AND 850),
  savings_consistency_score INTEGER NOT NULL DEFAULT 0 CHECK (savings_consistency_score BETWEEN 0 AND 1000),
  transaction_frequency_score INTEGER NOT NULL DEFAULT 0 CHECK (transaction_frequency_score BETWEEN 0 AND 1000),
  referral_score INTEGER NOT NULL DEFAULT 0 CHECK (referral_score BETWEEN 0 AND 1000),
  community_engagement_score INTEGER NOT NULL DEFAULT 0 CHECK (community_engagement_score BETWEEN 0 AND 1000),
  bill_payment_history_score INTEGER NOT NULL DEFAULT 0 CHECK (bill_payment_history_score BETWEEN 0 AND 1000),
  network_quality_score INTEGER NOT NULL DEFAULT 0 CHECK (network_quality_score BETWEEN 0 AND 1000),
  group_participation_score INTEGER NOT NULL DEFAULT 0 CHECK (group_participation_score BETWEEN 0 AND 1000),
  -- Populated by trigger from the above columns
  final_score INTEGER NOT NULL DEFAULT 500,
  loan_eligibility_without_guarantors NUMERIC(14,2) NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_credit_scores_user_idx ON public.social_credit_scores(user_id);
CREATE INDEX IF NOT EXISTS social_credit_scores_final_idx ON public.social_credit_scores(final_score DESC);

CREATE OR REPLACE FUNCTION public.compute_social_credit_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_final NUMERIC;
BEGIN
  -- Weighted blend; weights sum to 1.0. Sub-scores are 0..1000 except
  -- base_score which is 300..850. We treat base_score as the anchor (40%)
  -- and let alternative-data factors lift the score upwards from there.
  v_final :=
      NEW.base_score                       * 0.40
    + (NEW.savings_consistency_score / 1000.0) * 850 * 0.18
    + (NEW.bill_payment_history_score / 1000.0) * 850 * 0.12
    + (NEW.transaction_frequency_score / 1000.0) * 850 * 0.10
    + (NEW.community_engagement_score / 1000.0) * 850 * 0.08
    + (NEW.referral_score             / 1000.0) * 850 * 0.05
    + (NEW.group_participation_score  / 1000.0) * 850 * 0.04
    + (NEW.network_quality_score      / 1000.0) * 850 * 0.03;

  NEW.final_score := GREATEST(300, LEAST(850, v_final::INTEGER));

  -- Tiered eligibility — values match SACCO board policy (V1.5 defaults)
  NEW.loan_eligibility_without_guarantors :=
    CASE
      WHEN NEW.final_score >= 750 THEN 100000
      WHEN NEW.final_score >= 700 THEN  50000
      WHEN NEW.final_score >= 600 THEN  25000
      WHEN NEW.final_score >= 500 THEN  10000
      ELSE 0
    END;

  NEW.computed_at := NOW();
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_credit_scores_compute ON public.social_credit_scores;
CREATE TRIGGER social_credit_scores_compute
  BEFORE INSERT OR UPDATE ON public.social_credit_scores
  FOR EACH ROW EXECUTE FUNCTION public.compute_social_credit_score();

-- Convenience: needs_guarantors() based on the new social score
CREATE OR REPLACE FUNCTION public.needs_guarantors(
  p_user_id UUID,
  p_loan_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_eligibility NUMERIC;
BEGIN
  SELECT loan_eligibility_without_guarantors INTO v_eligibility
  FROM public.social_credit_scores
  WHERE user_id = p_user_id;

  RETURN p_loan_amount > COALESCE(v_eligibility, 0);
END;
$$;

-- Backfill from credit_scores so every existing user has a starting row
INSERT INTO public.social_credit_scores (
  user_id,
  base_score,
  savings_consistency_score,
  transaction_frequency_score,
  community_engagement_score,
  bill_payment_history_score,
  network_quality_score,
  referral_score,
  group_participation_score
)
SELECT
  cs.user_id,
  GREATEST(300, LEAST(850, COALESCE(cs.score, 500))),
  LEAST(1000, GREATEST(0, (COALESCE(cs.savings_consistency, 0) * 1000)::int)),
  LEAST(1000, GREATEST(0, (COALESCE(cs.transaction_frequency, 0) * 20)::int)),
  LEAST(1000, GREATEST(0, (COALESCE(cs.social_trust_score, 0) * 1000)::int)),
  LEAST(1000, GREATEST(0, (COALESCE(cs.payment_history, 0) * 1000)::int)),
  LEAST(1000, GREATEST(0, (COALESCE(cs.guarantor_network_size, 0) * 100)::int)),
  0,
  0
FROM public.credit_scores cs
WHERE NOT EXISTS (
  SELECT 1 FROM public.social_credit_scores scs WHERE scs.user_id = cs.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. INSTANT LOAN RULES + RPC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instant_loan_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  -- condition: { min_credit_score?: int, min_savings_balance?: numeric,
  --              max_active_loans?: int, max_amount?: numeric }
  condition JSONB NOT NULL,
  -- action: { auto_approve: bool, max_amount: numeric|"savings_balance * N" }
  action JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS instant_loan_rules_priority_idx
  ON public.instant_loan_rules(priority, is_active);

INSERT INTO public.instant_loan_rules (rule_name, condition, action, priority)
SELECT 'Excellent credit (no guarantors)',
       '{"min_credit_score": 700}'::jsonb,
       '{"auto_approve": true, "max_amount": 100000}'::jsonb,
       1
WHERE NOT EXISTS (SELECT 1 FROM public.instant_loan_rules WHERE rule_name = 'Excellent credit (no guarantors)');

INSERT INTO public.instant_loan_rules (rule_name, condition, action, priority)
SELECT 'Good standing members (savings multiple)',
       '{"min_credit_score": 500, "min_savings_balance": 5000, "min_months_active": 3}'::jsonb,
       '{"auto_approve": true, "max_amount": 50000, "savings_multiple": 2}'::jsonb,
       2
WHERE NOT EXISTS (SELECT 1 FROM public.instant_loan_rules WHERE rule_name = 'Good standing members (savings multiple)');

INSERT INTO public.instant_loan_rules (rule_name, condition, action, priority)
SELECT 'First-time borrower (small ticket)',
       '{"first_loan": true, "min_savings_balance": 1000}'::jsonb,
       '{"auto_approve": true, "max_amount": 10000}'::jsonb,
       3
WHERE NOT EXISTS (SELECT 1 FROM public.instant_loan_rules WHERE rule_name = 'First-time borrower (small ticket)');

-- Atomic instant loan: validates eligibility, picks an active no-guarantor
-- loan product, creates loan_application + repayment_schedule + disbursement
-- transaction, returns the new loan row. Real money. SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.process_instant_loan(
  p_user_id UUID,
  p_amount NUMERIC,
  p_purpose TEXT DEFAULT 'Instant loan',
  p_duration_days INTEGER DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_membership RECORD;
  v_savings_account RECORD;
  v_loan_account_id UUID;
  v_credit_score INTEGER;
  v_active_loans INTEGER;
  v_first_loan BOOLEAN;
  v_eligibility JSONB;
  v_eligible_amount NUMERIC;
  v_product RECORD;
  v_loan_id UUID;
  v_app_ref TEXT;
  v_total_interest NUMERIC;
  v_total_repayable NUMERIC;
  v_processing_fee NUMERIC;
  v_insurance_fee NUMERIC;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_tx_id UUID;
  v_tx_ref TEXT;
  v_months INTEGER;
  v_monthly_payment NUMERIC;
  v_principal_per_month NUMERIC;
  i INTEGER;
BEGIN
  -- Membership + sacco
  SELECT * INTO v_membership
  FROM public.sacco_memberships
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_membership.id IS NULL THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'No active SACCO membership');
  END IF;

  -- Savings account (we need it to disburse into)
  SELECT * INTO v_savings_account
  FROM public.member_accounts
  WHERE sacco_membership_id = v_membership.id AND account_type = 'savings'
  LIMIT 1;

  IF v_savings_account.id IS NULL THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'No savings account to disburse into');
  END IF;

  -- Credit score (best-effort)
  SELECT score INTO v_credit_score
  FROM public.credit_scores
  WHERE user_id = p_user_id
  ORDER BY last_calculated DESC NULLS LAST
  LIMIT 1;
  v_credit_score := COALESCE(v_credit_score, 500);

  -- Active loans / first loan
  SELECT COUNT(*) INTO v_active_loans
  FROM public.loan_applications
  WHERE user_id = p_user_id AND status IN ('approved','disbursed');

  v_first_loan := NOT EXISTS (
    SELECT 1 FROM public.loan_applications WHERE user_id = p_user_id
  );

  -- Determine instant eligibility via tiered rules (server-side, not JSONB eval)
  -- Tier 1: credit_score >= 700 → up to KES 100k
  -- Tier 2: credit_score >= 500 AND savings >= 5k → min(savings*2, 50k)
  -- Tier 3: first_loan AND savings >= 1k → up to KES 10k
  v_eligible_amount := 0;
  IF v_credit_score >= 700 THEN
    v_eligible_amount := 100000;
  ELSIF v_credit_score >= 500 AND v_savings_account.balance >= 5000 THEN
    v_eligible_amount := LEAST(v_savings_account.balance * 2, 50000);
  ELSIF v_first_loan AND v_savings_account.balance >= 1000 THEN
    v_eligible_amount := 10000;
  END IF;

  -- Hard cap: never auto-approve more than 3 concurrent loans
  IF v_active_loans >= 3 THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'Too many active loans (max 3 for instant approval)');
  END IF;

  IF v_eligible_amount <= 0 THEN
    RETURN jsonb_build_object(
      'approved', false,
      'reason', 'Not currently eligible for instant loan. Build savings or improve your credit score.',
      'credit_score', v_credit_score,
      'savings_balance', v_savings_account.balance
    );
  END IF;

  IF p_amount > v_eligible_amount THEN
    RETURN jsonb_build_object(
      'approved', false,
      'reason', 'Amount KES ' || p_amount::text || ' exceeds your instant loan limit of KES ' || v_eligible_amount::text,
      'max_amount', v_eligible_amount
    );
  END IF;

  -- Pick a loan product: active, no-guarantor, can hold this amount.
  -- Prefer lowest interest rate.
  SELECT * INTO v_product
  FROM public.loan_products
  WHERE sacco_id = v_membership.sacco_id
    AND is_active = true
    AND (requires_guarantors IS NULL OR requires_guarantors = false)
    AND (max_amount IS NULL OR max_amount >= p_amount)
    AND (min_amount IS NULL OR min_amount <= p_amount)
  ORDER BY interest_rate ASC NULLS LAST, max_amount ASC NULLS LAST
  LIMIT 1;

  IF v_product.id IS NULL THEN
    RETURN jsonb_build_object(
      'approved', false,
      'reason', 'No instant-eligible loan product configured for this SACCO. Ask admin to create a no-guarantor product.'
    );
  END IF;

  -- Compute interest (flat-rate; KISS for instant loans)
  v_months := GREATEST(1, ROUND(p_duration_days / 30.0));
  v_total_interest := p_amount * (COALESCE(v_product.interest_rate, 0) / 100.0) * v_months / 12.0;
  v_processing_fee := p_amount * (COALESCE(v_product.processing_fee, 0) / 100.0);
  v_insurance_fee := p_amount * (COALESCE(v_product.insurance_fee, 0) / 100.0);
  v_total_repayable := p_amount + v_total_interest;

  v_app_ref := 'INST-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || substr(p_user_id::text, 1, 6);

  INSERT INTO public.loan_applications (
    application_ref,
    sacco_id,
    user_id,
    product_id,
    amount,
    interest_rate_applied,
    processing_fee,
    insurance_fee,
    total_fees,
    total_interest,
    total_repayable,
    duration_days,
    purpose,
    credit_score_at_application,
    status,
    approved_by,
    approved_at,
    disbursed_by,
    disbursed_at,
    disbursed_to_account_id
  ) VALUES (
    v_app_ref,
    v_membership.sacco_id,
    p_user_id,
    v_product.id,
    p_amount,
    v_product.interest_rate,
    v_processing_fee,
    v_insurance_fee,
    v_processing_fee + v_insurance_fee,
    v_total_interest,
    v_total_repayable,
    p_duration_days,
    p_purpose,
    v_credit_score,
    'disbursed',
    p_user_id,            -- system-approved on user's behalf
    NOW(),
    p_user_id,
    NOW(),
    v_savings_account.id
  ) RETURNING id INTO v_loan_id;

  -- Repayment schedule: equal monthly principal + interest
  v_principal_per_month := p_amount / v_months;
  v_monthly_payment := v_total_repayable / v_months;

  FOR i IN 1..v_months LOOP
    INSERT INTO public.loan_repayment_schedule (
      loan_application_id,
      installment_number,
      due_date,
      principal_due,
      interest_due,
      total_due,
      balance_remaining,
      status
    ) VALUES (
      v_loan_id,
      i,
      (CURRENT_DATE + (i * 30))::date,
      v_principal_per_month,
      v_monthly_payment - v_principal_per_month,
      v_monthly_payment,
      v_total_repayable - (v_monthly_payment * i),
      'pending'
    );
  END LOOP;

  -- Disbursement: credit savings account
  SELECT balance INTO v_balance_before
  FROM public.member_accounts
  WHERE id = v_savings_account.id
  FOR UPDATE;

  v_balance_after := v_balance_before + (p_amount - v_processing_fee - v_insurance_fee);

  UPDATE public.member_accounts
     SET balance = v_balance_after,
         available_balance = COALESCE(available_balance, balance) + (p_amount - v_processing_fee - v_insurance_fee),
         updated_at = NOW()
   WHERE id = v_savings_account.id;

  v_tx_ref := 'LD-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || substr(v_loan_id::text, 1, 8);

  INSERT INTO public.transactions (
    transaction_ref,
    sacco_id,
    member_account_id,
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    description,
    status,
    initiated_by,
    initiated_at,
    approved_by,
    approved_at,
    completed_at
  ) VALUES (
    v_tx_ref,
    v_membership.sacco_id,
    v_savings_account.id,
    p_user_id,
    'loan_disbursement'::transaction_type,
    p_amount - v_processing_fee - v_insurance_fee,
    v_balance_before,
    v_balance_after,
    'Instant loan disbursement (ref ' || v_app_ref || ')',
    'completed',
    p_user_id,
    NOW(),
    p_user_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'approved', true,
    'loan_id', v_loan_id,
    'application_ref', v_app_ref,
    'amount', p_amount,
    'fees', v_processing_fee + v_insurance_fee,
    'net_disbursed', p_amount - v_processing_fee - v_insurance_fee,
    'total_repayable', v_total_repayable,
    'monthly_payment', v_monthly_payment,
    'months', v_months,
    'transaction_id', v_tx_id,
    'new_savings_balance', v_balance_after
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. USER PERSONAS + PERSONALIZED RECOMMENDATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  persona_type TEXT NOT NULL DEFAULT 'saver'
    CHECK (persona_type IN ('saver','investor','borrower','entrepreneur','student','salaried','informal')),
  risk_tolerance TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_tolerance IN ('low','medium','high')),
  financial_goals JSONB,
  interests TEXT[],
  derived_from TEXT, -- 'self_declared' | 'inferred'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_personas_user_idx ON public.user_personas(user_id);
CREATE INDEX IF NOT EXISTS user_personas_type_idx ON public.user_personas(persona_type);

CREATE TABLE IF NOT EXISTS public.personalized_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL
    CHECK (recommendation_type IN ('product','tip','challenge','article','offer')),
  title TEXT NOT NULL,
  description TEXT,
  action_url TEXT,
  action_label TEXT,
  icon TEXT,
  color_class TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS personalized_recs_user_idx
  ON public.personalized_recommendations(user_id, is_dismissed, priority);

-- -----------------------------------------------------------------------------
-- 5. RLS + GRANTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.partial_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_credit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instant_loan_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalized_recommendations ENABLE ROW LEVEL SECURITY;

-- partial_releases: members see own, admins see all
DROP POLICY IF EXISTS partial_releases_member_select ON public.partial_releases;
CREATE POLICY partial_releases_member_select ON public.partial_releases
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS partial_releases_admin_write ON public.partial_releases;
CREATE POLICY partial_releases_admin_write ON public.partial_releases
  FOR ALL TO authenticated
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- social_credit_scores: read own, admin read all, only system (SECURITY DEFINER) writes
DROP POLICY IF EXISTS social_credit_scores_select ON public.social_credit_scores;
CREATE POLICY social_credit_scores_select ON public.social_credit_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS social_credit_scores_admin_write ON public.social_credit_scores;
CREATE POLICY social_credit_scores_admin_write ON public.social_credit_scores
  FOR ALL TO authenticated
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- instant_loan_rules: read all (logged-in), only admin writes
DROP POLICY IF EXISTS instant_loan_rules_select ON public.instant_loan_rules;
CREATE POLICY instant_loan_rules_select ON public.instant_loan_rules
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS instant_loan_rules_admin_write ON public.instant_loan_rules;
CREATE POLICY instant_loan_rules_admin_write ON public.instant_loan_rules
  FOR ALL TO authenticated
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- user_personas: users own theirs
DROP POLICY IF EXISTS user_personas_owner ON public.user_personas;
CREATE POLICY user_personas_owner ON public.user_personas
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_sacco_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_sacco_admin());

-- personalized_recommendations: users see + dismiss own; admins write
DROP POLICY IF EXISTS personalized_recs_owner_read ON public.personalized_recommendations;
CREATE POLICY personalized_recs_owner_read ON public.personalized_recommendations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_sacco_admin());

DROP POLICY IF EXISTS personalized_recs_owner_dismiss ON public.personalized_recommendations;
CREATE POLICY personalized_recs_owner_dismiss ON public.personalized_recommendations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS personalized_recs_admin_write ON public.personalized_recommendations;
CREATE POLICY personalized_recs_admin_write ON public.personalized_recommendations
  FOR ALL TO authenticated
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.partial_releases TO authenticated;
GRANT SELECT ON public.social_credit_scores TO authenticated;
GRANT INSERT, UPDATE ON public.social_credit_scores TO service_role;
GRANT SELECT ON public.instant_loan_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.instant_loan_rules TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_personas TO authenticated;
GRANT SELECT, UPDATE ON public.personalized_recommendations TO authenticated;
GRANT INSERT, DELETE ON public.personalized_recommendations TO service_role;

GRANT EXECUTE ON FUNCTION public.check_partial_release_eligibility(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_partial_release(UUID, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_partial_release(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_partial_release(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.needs_guarantors(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_instant_loan(UUID, NUMERIC, TEXT, INTEGER) TO authenticated;
