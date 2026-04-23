-- Atomic (all-or-nothing) interest posting and dividend lifecycle.
--
-- Before this migration the corresponding Next.js routes walked the account
-- list in a JavaScript for-loop, running one UPDATE + one INSERT per row.
-- If the process crashed on row N, rows 1..N-1 were credited but rows
-- N..end were not. The reservation/claim row stayed, blocking re-run.
-- This migration wraps each flow in a PL/pgSQL function that runs in a
-- single transaction: either every account is credited or none is.
--
-- All three functions are SECURITY DEFINER so the server route (running as
-- `authenticated`) can call them via supabase.rpc(...). Execute is granted
-- only to `authenticated` -- the route still gates the admin role check
-- via requireAdmin() before calling. Direct DB access from a member JWT
-- still passes through the role check inside the function.

-- =============================================================
-- post_monthly_interest(period_year, period_month)
-- =============================================================

CREATE OR REPLACE FUNCTION public.post_monthly_interest(
  p_year integer,
  p_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_posting_id uuid;
  v_account record;
  v_interest numeric;
  v_new_balance numeric;
  v_total_interest numeric := 0;
  v_accounts_count integer := 0;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_sacco_admin() THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'p_month must be 1-12';
  END IF;

  -- Replay guard: unique(period_year, period_month) on interest_postings
  -- makes concurrent / repeated calls fail fast instead of double-crediting.
  INSERT INTO public.interest_postings (
    period_year, period_month, posted_by, accounts_count, total_interest
  ) VALUES (
    p_year, p_month, v_admin, 0, 0
  )
  RETURNING id INTO v_posting_id;

  FOR v_account IN
    SELECT ma.id, ma.balance, ma.interest_rate,
           sm.user_id, sm.sacco_id
      FROM public.member_accounts ma
      JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
     WHERE ma.account_type = 'savings'
       AND COALESCE(ma.is_locked, false) = false
       AND COALESCE(ma.balance, 0) > 0
       AND COALESCE(ma.interest_rate, 0) > 0
     FOR UPDATE OF ma
  LOOP
    v_interest := ROUND((v_account.balance * v_account.interest_rate / 100.0 / 365.0 * 30.0)::numeric, 2);
    IF v_interest <= 0 THEN
      CONTINUE;
    END IF;

    v_new_balance := v_account.balance + v_interest;

    UPDATE public.member_accounts
       SET balance = v_new_balance,
           updated_at = NOW()
     WHERE id = v_account.id;

    INSERT INTO public.transactions (
      user_id, member_account_id, sacco_id, type, amount,
      balance_before, balance_after, status, description, completed_at
    ) VALUES (
      v_account.user_id,
      v_account.id,
      v_account.sacco_id,
      'interest',
      v_interest,
      v_account.balance,
      v_new_balance,
      'completed',
      format('Monthly interest at %s%% (%s-%s)', v_account.interest_rate, p_year, LPAD(p_month::text, 2, '0')),
      NOW()
    );

    v_total_interest := v_total_interest + v_interest;
    v_accounts_count := v_accounts_count + 1;
  END LOOP;

  UPDATE public.interest_postings
     SET accounts_count = v_accounts_count,
         total_interest = v_total_interest
   WHERE id = v_posting_id;

  RETURN jsonb_build_object(
    'posting_id', v_posting_id,
    'period_year', p_year,
    'period_month', p_month,
    'accounts_processed', v_accounts_count,
    'total_interest', v_total_interest
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_monthly_interest(integer, integer)
  TO authenticated, service_role;

-- =============================================================
-- declare_dividend(rate, financial_year)
-- =============================================================

CREATE OR REPLACE FUNCTION public.declare_dividend(
  p_rate numeric,
  p_financial_year text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_dividend_id uuid;
  v_total_share_capital numeric := 0;
  v_total_dividend numeric := 0;
  v_members_count integer := 0;
  v_account record;
  v_gross numeric;
  v_tax numeric;
  v_net numeric;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_sacco_admin() THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'p_rate must be between 0 and 100';
  END IF;

  IF p_financial_year IS NULL OR length(trim(p_financial_year)) = 0 THEN
    RAISE EXCEPTION 'p_financial_year is required';
  END IF;

  SELECT COALESCE(SUM(balance), 0) INTO v_total_share_capital
    FROM public.member_accounts
   WHERE account_type = 'share_capital';

  v_total_dividend := ROUND((v_total_share_capital * p_rate / 100.0)::numeric, 2);

  INSERT INTO public.dividends (
    financial_year, dividend_rate, total_share_capital,
    total_dividend_amount, declared_date, status
  ) VALUES (
    p_financial_year, p_rate, v_total_share_capital,
    v_total_dividend, CURRENT_DATE, 'declared'
  )
  RETURNING id INTO v_dividend_id;

  FOR v_account IN
    SELECT ma.id, ma.balance, sm.user_id
      FROM public.member_accounts ma
      JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
     WHERE ma.account_type = 'share_capital'
       AND COALESCE(ma.balance, 0) > 0
       AND sm.user_id IS NOT NULL
  LOOP
    v_gross := ROUND((v_account.balance * p_rate / 100.0)::numeric, 2);
    v_tax   := ROUND((v_gross * 0.05)::numeric, 2);
    v_net   := v_gross - v_tax;

    INSERT INTO public.member_dividends (
      dividend_id, user_id, share_capital,
      dividend_amount, withholding_tax, net_amount, paid
    ) VALUES (
      v_dividend_id, v_account.user_id, v_account.balance,
      v_gross, v_tax, v_net, false
    );

    v_members_count := v_members_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'dividend_id', v_dividend_id,
    'financial_year', p_financial_year,
    'rate', p_rate,
    'total_share_capital', v_total_share_capital,
    'total_dividend_amount', v_total_dividend,
    'members_count', v_members_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.declare_dividend(numeric, text)
  TO authenticated, service_role;

-- =============================================================
-- pay_dividend(dividend_id)
-- =============================================================

CREATE OR REPLACE FUNCTION public.pay_dividend(
  p_dividend_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_claimed record;
  v_md record;
  v_savings record;
  v_new_balance numeric;
  v_members_paid integer := 0;
  v_total_paid numeric := 0;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_sacco_admin() THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  -- Atomic claim: flip declared -> paying. A concurrent second call
  -- matches zero rows and the EXCEPTION below fires.
  UPDATE public.dividends
     SET status = 'paying'
   WHERE id = p_dividend_id AND status = 'declared'
  RETURNING id, financial_year, dividend_rate INTO v_claimed;

  IF v_claimed.id IS NULL THEN
    RAISE EXCEPTION 'Dividend is not in declared state (already paying or paid)'
      USING ERRCODE = '55000';
  END IF;

  FOR v_md IN
    SELECT id, user_id, net_amount
      FROM public.member_dividends
     WHERE dividend_id = p_dividend_id
       AND COALESCE(paid, false) = false
  LOOP
    SELECT ma.id, ma.balance, ma.sacco_membership_id, sm.sacco_id
      INTO v_savings
      FROM public.member_accounts ma
      JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
     WHERE sm.user_id = v_md.user_id
       AND ma.account_type = 'savings'
     LIMIT 1
     FOR UPDATE OF ma;

    IF v_savings.id IS NULL THEN
      -- Member has no savings account; leave unpaid and continue.
      CONTINUE;
    END IF;

    v_new_balance := COALESCE(v_savings.balance, 0) + v_md.net_amount;

    UPDATE public.member_accounts
       SET balance = v_new_balance,
           updated_at = NOW()
     WHERE id = v_savings.id;

    INSERT INTO public.transactions (
      user_id, member_account_id, sacco_id, type, amount,
      balance_before, balance_after, status, description, completed_at
    ) VALUES (
      v_md.user_id,
      v_savings.id,
      v_savings.sacco_id,
      'dividend',
      v_md.net_amount,
      COALESCE(v_savings.balance, 0),
      v_new_balance,
      'completed',
      format('Dividend payout %s (%s)', p_dividend_id, v_claimed.financial_year),
      NOW()
    );

    UPDATE public.member_dividends
       SET paid = true, paid_date = CURRENT_DATE
     WHERE id = v_md.id;

    v_members_paid := v_members_paid + 1;
    v_total_paid := v_total_paid + v_md.net_amount;
  END LOOP;

  UPDATE public.dividends
     SET status = 'paid', payment_date = CURRENT_DATE
   WHERE id = p_dividend_id;

  RETURN jsonb_build_object(
    'dividend_id', p_dividend_id,
    'members_paid', v_members_paid,
    'total_paid', v_total_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_dividend(uuid)
  TO authenticated, service_role;
