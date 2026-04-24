-- =====================================================================
-- 20260425_ussd_write_ops.sql
--
-- V1.8 — USSD write operations (narrow scope).
--
-- Adds atomic, PIN-gated RPCs for:
--   A. ussd_transfer_to_shares  — savings → shares (internal move)
--   B. ussd_repay_loan          — savings → loan repayment (internal)
--
-- Deliberately out of scope (separate PR + compliance lift):
--   * M-Pesa STK withdrawals (needs KYB, STK push handlers, reversal flow)
--   * Transfers to other members (needs fraud checks + multi-factor)
--   * Loan applications via USSD (needs terms disclosure + consent capture)
--
-- All RPCs here:
--   * verify PIN every call (defence in depth; webhook already gated)
--   * run in a single transaction — debit/credit/transaction-row together
--   * reject if member has no active membership or the accounts don't exist
--   * return structured result (not just a boolean) for USSD rendering
--   * are SECURITY DEFINER + GRANT EXECUTE only to service_role
--
-- Idempotent: safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Shared helper: atomic move between two member_account rows.
-- Returns (new_from_balance, new_to_balance).
-- Raises on insufficient funds, missing accounts, or non-positive amount.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ussd_move_funds(
  p_user_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_from_tx_type TEXT,      -- e.g. 'withdrawal'
  p_to_tx_type TEXT,        -- e.g. 'deposit' / 'loan_repayment'
  p_description TEXT
)
RETURNS TABLE (new_from_balance NUMERIC, new_to_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_new_from NUMERIC;
  v_new_to NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '22023';
  END IF;

  -- Lock both accounts in a stable id order to avoid deadlocks when
  -- two sessions race on the same pair.
  IF p_from_account_id < p_to_account_id THEN
    SELECT balance INTO v_from_balance FROM public.member_accounts
      WHERE id = p_from_account_id FOR UPDATE;
    SELECT balance INTO v_to_balance FROM public.member_accounts
      WHERE id = p_to_account_id FOR UPDATE;
  ELSE
    SELECT balance INTO v_to_balance FROM public.member_accounts
      WHERE id = p_to_account_id FOR UPDATE;
    SELECT balance INTO v_from_balance FROM public.member_accounts
      WHERE id = p_from_account_id FOR UPDATE;
  END IF;

  IF v_from_balance IS NULL OR v_to_balance IS NULL THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = '42704';
  END IF;
  IF v_from_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = '22023';
  END IF;

  v_new_from := v_from_balance - p_amount;
  v_new_to := v_to_balance + p_amount;

  UPDATE public.member_accounts
     SET balance = v_new_from, updated_at = NOW()
   WHERE id = p_from_account_id;
  UPDATE public.member_accounts
     SET balance = v_new_to, updated_at = NOW()
   WHERE id = p_to_account_id;

  INSERT INTO public.transactions
    (user_id, member_account_id, type, amount, balance_before,
     balance_after, status, description, completed_at)
  VALUES
    (p_user_id, p_from_account_id, p_from_tx_type, p_amount,
     v_from_balance, v_new_from, 'completed', p_description, NOW()),
    (p_user_id, p_to_account_id, p_to_tx_type, p_amount,
     v_to_balance, v_new_to, 'completed', p_description, NOW());

  new_from_balance := v_new_from;
  new_to_balance := v_new_to;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._ussd_move_funds(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ussd_move_funds(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM authenticated;


-- ---------------------------------------------------------------------
-- A. ussd_transfer_to_shares(p_phone, p_pin, p_amount)
--     Move `amount` from the member's savings account to their shares
--     account. PIN-verified. Atomic.
--
--     Returns one row:
--       ok          BOOLEAN
--       code        TEXT      -- machine-readable reason
--       message     TEXT      -- user-facing
--       new_savings NUMERIC
--       new_shares  NUMERIC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ussd_transfer_to_shares(
  p_phone TEXT,
  p_pin TEXT,
  p_amount NUMERIC
)
RETURNS TABLE (
  ok BOOLEAN,
  code TEXT,
  message TEXT,
  new_savings NUMERIC,
  new_shares NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_membership_id UUID;
  v_savings_id UUID;
  v_shares_id UUID;
  v_result RECORD;
BEGIN
  -- 1. Verify PIN
  v_user_id := public.verify_ussd_pin(p_phone, p_pin);
  IF v_user_id IS NULL THEN
    ok := FALSE; code := 'bad_pin'; message := 'Invalid PIN.';
    new_savings := 0; new_shares := 0; RETURN NEXT; RETURN;
  END IF;

  -- 2. Resolve membership + account ids
  SELECT sm.id INTO v_membership_id
    FROM public.sacco_memberships sm
    WHERE sm.user_id = v_user_id AND sm.status = 'active'
    LIMIT 1;
  IF v_membership_id IS NULL THEN
    ok := FALSE; code := 'no_membership';
    message := 'You are not an active member of any SACCO.';
    new_savings := 0; new_shares := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT id INTO v_savings_id FROM public.member_accounts
    WHERE sacco_membership_id = v_membership_id AND account_type = 'savings';
  SELECT id INTO v_shares_id FROM public.member_accounts
    WHERE sacco_membership_id = v_membership_id AND account_type = 'shares';

  IF v_savings_id IS NULL OR v_shares_id IS NULL THEN
    ok := FALSE; code := 'missing_account';
    message := 'Savings or shares account not set up. Visit your branch.';
    new_savings := 0; new_shares := 0; RETURN NEXT; RETURN;
  END IF;

  -- 3. Atomic move
  BEGIN
    SELECT * INTO v_result FROM public._ussd_move_funds(
      v_user_id, v_savings_id, v_shares_id, p_amount,
      'withdrawal', 'shares_purchase',
      'USSD shares top-up'
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      ok := FALSE; code := 'insufficient';
      message := 'Insufficient savings balance.';
      new_savings := 0; new_shares := 0; RETURN NEXT; RETURN;
    WHEN OTHERS THEN
      ok := FALSE; code := 'internal';
      message := 'Transfer failed. Try again later.';
      new_savings := 0; new_shares := 0; RETURN NEXT; RETURN;
  END;

  ok := TRUE; code := 'ok';
  message := 'Shares topped up.';
  new_savings := v_result.new_from_balance;
  new_shares := v_result.new_to_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.ussd_transfer_to_shares(TEXT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ussd_transfer_to_shares(TEXT, TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ussd_transfer_to_shares(TEXT, TEXT, NUMERIC) TO service_role;


-- ---------------------------------------------------------------------
-- B. ussd_repay_loan(p_phone, p_pin, p_amount)
--     Move `amount` from savings to loan balance. Loan balance convention:
--     a positive balance means "amount owed" — a repayment DECREASES
--     the loan balance. `_ussd_move_funds` adds to the destination, so
--     we cap the repayment to outstanding and call the helper with a
--     synthetic "payment" account... actually the simplest is: decrement
--     savings manually, decrement loan balance manually, write two txs.
--     Doing it this way keeps the semantics honest.
--
--     Returns:
--       ok             BOOLEAN
--       code           TEXT
--       message        TEXT
--       new_savings    NUMERIC
--       new_loan       NUMERIC   (remaining balance)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ussd_repay_loan(
  p_phone TEXT,
  p_pin TEXT,
  p_amount NUMERIC
)
RETURNS TABLE (
  ok BOOLEAN,
  code TEXT,
  message TEXT,
  new_savings NUMERIC,
  new_loan NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_membership_id UUID;
  v_savings_id UUID;
  v_loan_id UUID;
  v_savings_balance NUMERIC;
  v_loan_balance NUMERIC;
  v_applied NUMERIC;
  v_new_savings NUMERIC;
  v_new_loan NUMERIC;
BEGIN
  v_user_id := public.verify_ussd_pin(p_phone, p_pin);
  IF v_user_id IS NULL THEN
    ok := FALSE; code := 'bad_pin'; message := 'Invalid PIN.';
    new_savings := 0; new_loan := 0; RETURN NEXT; RETURN;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    ok := FALSE; code := 'bad_amount'; message := 'Amount must be positive.';
    new_savings := 0; new_loan := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT sm.id INTO v_membership_id
    FROM public.sacco_memberships sm
    WHERE sm.user_id = v_user_id AND sm.status = 'active'
    LIMIT 1;
  IF v_membership_id IS NULL THEN
    ok := FALSE; code := 'no_membership';
    message := 'You are not an active member of any SACCO.';
    new_savings := 0; new_loan := 0; RETURN NEXT; RETURN;
  END IF;

  -- Lock both accounts, consistent order
  SELECT id, balance INTO v_savings_id, v_savings_balance
    FROM public.member_accounts
    WHERE sacco_membership_id = v_membership_id AND account_type = 'savings'
    FOR UPDATE;
  SELECT id, balance INTO v_loan_id, v_loan_balance
    FROM public.member_accounts
    WHERE sacco_membership_id = v_membership_id AND account_type = 'loan'
    FOR UPDATE;

  IF v_savings_id IS NULL OR v_loan_id IS NULL THEN
    ok := FALSE; code := 'missing_account';
    message := 'Accounts not set up.';
    new_savings := 0; new_loan := 0; RETURN NEXT; RETURN;
  END IF;

  IF v_loan_balance <= 0 THEN
    ok := FALSE; code := 'no_loan';
    message := 'You have no outstanding loan.';
    new_savings := v_savings_balance; new_loan := v_loan_balance;
    RETURN NEXT; RETURN;
  END IF;

  IF v_savings_balance < p_amount THEN
    ok := FALSE; code := 'insufficient';
    message := 'Insufficient savings balance.';
    new_savings := v_savings_balance; new_loan := v_loan_balance;
    RETURN NEXT; RETURN;
  END IF;

  -- Never overpay the loan — cap to outstanding
  v_applied := LEAST(p_amount, v_loan_balance);
  v_new_savings := v_savings_balance - v_applied;
  v_new_loan := v_loan_balance - v_applied;

  UPDATE public.member_accounts
     SET balance = v_new_savings, updated_at = NOW()
   WHERE id = v_savings_id;
  UPDATE public.member_accounts
     SET balance = v_new_loan, updated_at = NOW()
   WHERE id = v_loan_id;

  INSERT INTO public.transactions
    (user_id, member_account_id, type, amount, balance_before,
     balance_after, status, description, completed_at)
  VALUES
    (v_user_id, v_savings_id, 'withdrawal', v_applied,
     v_savings_balance, v_new_savings, 'completed',
     'USSD loan repayment', NOW()),
    (v_user_id, v_loan_id, 'loan_repayment', v_applied,
     v_loan_balance, v_new_loan, 'completed',
     'USSD loan repayment', NOW());

  ok := TRUE;
  code := CASE WHEN v_applied < p_amount THEN 'capped' ELSE 'ok' END;
  message := CASE
    WHEN v_applied < p_amount
      THEN 'Loan cleared. Excess returned to savings.'
    ELSE 'Loan repayment successful.'
  END;
  -- If we capped, put the excess back into savings to keep books square.
  IF v_applied < p_amount THEN
    DECLARE
      v_refund NUMERIC := p_amount - v_applied;
      v_refund_prev NUMERIC := v_new_savings;
    BEGIN
      v_new_savings := v_new_savings + 0;  -- no-op; we only "spent" v_applied, never took p_amount
      -- Note: we debited only v_applied to begin with, so nothing to refund.
      -- Message still flags that the input was larger than the outstanding.
    END;
  END IF;
  new_savings := v_new_savings;
  new_loan := v_new_loan;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.ussd_repay_loan(TEXT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ussd_repay_loan(TEXT, TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ussd_repay_loan(TEXT, TEXT, NUMERIC) TO service_role;
