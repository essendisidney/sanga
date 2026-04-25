-- =====================================================================
-- M-Pesa V2 Phase 1: STK Push deposits
--
-- Tables:
--   mpesa_transactions  - one row per Daraja request, owned by member_id
--   bill_payments       - schema scaffold for future phases (paybill / KPLC etc)
--   airtime_purchases   - schema scaffold for future phases
--
-- RLS: members can read their own rows. No client may write — service role
-- bypasses RLS and is the only writer (callback handler + deposit route use
-- createAdminClient).
--
-- Atomicity: process_mpesa_deposit_callback() runs the full
--   "lock pending row -> credit savings -> write ledger row -> mark complete"
-- chain in a single SECURITY DEFINER transaction. Idempotent on the status
-- column AND on the unique mpesa_receipt index, so Safaricom's retry storms
-- can't double-credit.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.mpesa_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref TEXT UNIQUE NOT NULL DEFAULT ('MP-' || gen_random_uuid()::text),
  member_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_account_id UUID REFERENCES public.member_accounts(id) ON DELETE SET NULL,
  ledger_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,

  -- Money + identity
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  phone_number TEXT NOT NULL,

  -- Daraja correlation IDs
  checkout_request_id TEXT UNIQUE,
  merchant_request_id TEXT,
  mpesa_receipt TEXT UNIQUE,

  -- Type / classification
  transaction_type TEXT NOT NULL DEFAULT 'deposit'
    CHECK (transaction_type IN ('deposit', 'withdrawal', 'bill_payment', 'airtime')),

  -- Status machine
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  result_code INTEGER,
  result_desc TEXT,

  retry_count INTEGER NOT NULL DEFAULT 0,

  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  callback_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_member ON public.mpesa_transactions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpesa_status ON public.mpesa_transactions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mpesa_checkout ON public.mpesa_transactions(checkout_request_id);

-- ---------------------------------------------------------------------
-- bill_payments: scaffold only. No APIs in this phase.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mpesa_transaction_id UUID REFERENCES public.mpesa_transactions(id) ON DELETE SET NULL,

  bill_type TEXT NOT NULL CHECK (bill_type IN ('kplc', 'water', 'internet', 'tv', 'other')),
  account_number TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reference TEXT,

  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_member ON public.bill_payments(member_id, created_at DESC);

-- ---------------------------------------------------------------------
-- airtime_purchases: scaffold only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.airtime_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mpesa_transaction_id UUID REFERENCES public.mpesa_transactions(id) ON DELETE SET NULL,

  phone_number TEXT NOT NULL,
  network TEXT,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),

  status TEXT NOT NULL DEFAULT 'pending',
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airtime_member ON public.airtime_purchases(member_id, created_at DESC);

-- ---------------------------------------------------------------------
-- RLS: read-own only, service role bypasses for writes
-- ---------------------------------------------------------------------
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airtime_purchases  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpesa_tx_select_own ON public.mpesa_transactions;
CREATE POLICY mpesa_tx_select_own ON public.mpesa_transactions
  FOR SELECT TO authenticated
  USING (member_id = auth.uid());

DROP POLICY IF EXISTS bill_payments_select_own ON public.bill_payments;
CREATE POLICY bill_payments_select_own ON public.bill_payments
  FOR SELECT TO authenticated
  USING (member_id = auth.uid());

DROP POLICY IF EXISTS airtime_select_own ON public.airtime_purchases;
CREATE POLICY airtime_select_own ON public.airtime_purchases
  FOR SELECT TO authenticated
  USING (member_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.mpesa_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bill_payments      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.airtime_purchases  FROM anon, authenticated;

-- =====================================================================
-- Atomic deposit callback handler.
--
-- Called by /api/mpesa/callback after a successful Daraja STK callback.
-- Does the full credit + ledger insert + status flip in one transaction
-- with a row lock on the mpesa_transactions row. Idempotent: a duplicate
-- callback for the same checkout_request_id returns "already_processed"
-- without touching balances. A different mpesa_receipt for the same
-- pending row is rejected on the unique index.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_mpesa_deposit_callback(
  p_checkout_request_id TEXT,
  p_mpesa_receipt TEXT,
  p_amount NUMERIC,
  p_result_code INTEGER,
  p_result_desc TEXT
)
RETURNS TABLE (
  status TEXT,
  mpesa_transaction_id UUID,
  ledger_transaction_id UUID,
  new_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mpesa public.mpesa_transactions%ROWTYPE;
  v_account_id UUID;
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_sacco_id UUID;
  v_ledger_id UUID;
BEGIN
  -- Lock the pending row. Nobody else may touch this checkout_request_id
  -- until we commit.
  SELECT * INTO v_mpesa
  FROM public.mpesa_transactions
  WHERE checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mpesa_transaction not found for checkout_request_id=%', p_checkout_request_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotency: a second callback for the same row is a no-op.
  IF v_mpesa.status <> 'pending' THEN
    status := 'already_processed';
    mpesa_transaction_id := v_mpesa.id;
    ledger_transaction_id := v_mpesa.ledger_transaction_id;
    new_balance := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Failed payment: just record the result, no money moves.
  IF p_result_code <> 0 THEN
    UPDATE public.mpesa_transactions
       SET status = 'failed',
           result_code = p_result_code,
           result_desc = p_result_desc,
           callback_received_at = NOW()
     WHERE id = v_mpesa.id;

    status := 'failed';
    mpesa_transaction_id := v_mpesa.id;
    ledger_transaction_id := NULL;
    new_balance := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Success path: resolve member's savings account (locked).
  SELECT ma.id, ma.balance, sm.sacco_id
    INTO v_account_id, v_balance, v_sacco_id
    FROM public.member_accounts ma
    JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
   WHERE sm.user_id = v_mpesa.member_id
     AND ma.account_type = 'savings'
   ORDER BY ma.created_at ASC
   LIMIT 1
   FOR UPDATE OF ma;

  IF v_account_id IS NULL THEN
    -- We can't credit. Mark the M-Pesa row as failed so the user's money
    -- doesn't appear lost — operations team needs to manually reconcile
    -- and cut a refund or open the account.
    UPDATE public.mpesa_transactions
       SET status = 'failed',
           result_code = -1,
           result_desc = 'No savings account for member',
           callback_received_at = NOW()
     WHERE id = v_mpesa.id;

    RAISE EXCEPTION 'No savings account for member_id=%', v_mpesa.member_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE public.member_accounts
     SET balance = v_new_balance,
         updated_at = NOW()
   WHERE id = v_account_id;

  INSERT INTO public.transactions (
    user_id, member_account_id, sacco_id, type, amount,
    balance_before, balance_after, status, description,
    mpesa_receipt, completed_at
  ) VALUES (
    v_mpesa.member_id, v_account_id, v_sacco_id, 'deposit', p_amount,
    v_balance, v_new_balance, 'completed',
    'M-Pesa deposit - ' || p_mpesa_receipt,
    p_mpesa_receipt, NOW()
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.mpesa_transactions
     SET status = 'completed',
         mpesa_receipt = p_mpesa_receipt,
         amount = p_amount,
         result_code = p_result_code,
         result_desc = COALESCE(p_result_desc, 'Success'),
         completed_at = NOW(),
         callback_received_at = NOW(),
         member_account_id = v_account_id,
         ledger_transaction_id = v_ledger_id
   WHERE id = v_mpesa.id;

  status := 'completed';
  mpesa_transaction_id := v_mpesa.id;
  ledger_transaction_id := v_ledger_id;
  new_balance := v_new_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.process_mpesa_deposit_callback(TEXT, TEXT, NUMERIC, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_mpesa_deposit_callback(TEXT, TEXT, NUMERIC, INTEGER, TEXT) TO service_role;
