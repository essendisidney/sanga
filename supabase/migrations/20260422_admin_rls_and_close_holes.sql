-- Admin-scope RLS and close open holes on public tables.
--
-- Problems this fixes:
-- 1. Admin dashboard /api/admin/stats counts were all zero because
--    loan_applications, transactions, interest_postings, saccos, loan_products
--    had RLS enabled but NO policies, so every authenticated SELECT returned
--    an empty set. Admins also could not see other members' member_accounts
--    because the only policy on that table was "own account" scoped.
-- 2. notifications, savings_goals, fixed_deposits, credit_scores,
--    dividends, member_dividends, loan_repayment_schedule all had RLS
--    DISABLED entirely, so any authenticated user could read/write every
--    other user's data via the public REST endpoint.
--
-- Strategy:
-- - Add a SECURITY DEFINER helper is_sacco_admin() so admin/manager role
--   checks do not recurse into sacco_memberships RLS.
-- - Add admin SELECT (and ALL where appropriate) policies to every table
--   that the admin dashboard and staff pages read.
-- - Enable RLS on the unprotected tables and add "own row" policies for
--   members plus admin full-access policies for staff.

-- =============================================================
-- Helper function
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_sacco_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sacco_memberships
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'manager')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_sacco_admin() TO anon, authenticated, service_role;

-- =============================================================
-- users
-- =============================================================

DROP POLICY IF EXISTS "Admins read all users" ON public.users;
CREATE POLICY "Admins read all users"
  ON public.users FOR SELECT
  USING (public.is_sacco_admin());

DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins manage users" ON public.users;
CREATE POLICY "Admins manage users"
  ON public.users FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- sacco_memberships
-- =============================================================

DROP POLICY IF EXISTS "Admins manage memberships" ON public.sacco_memberships;
CREATE POLICY "Admins manage memberships"
  ON public.sacco_memberships FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- saccos
-- =============================================================

DROP POLICY IF EXISTS "Members view own sacco" ON public.saccos;
CREATE POLICY "Members view own sacco"
  ON public.saccos FOR SELECT
  USING (
    id IN (
      SELECT sacco_id FROM public.sacco_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage saccos" ON public.saccos;
CREATE POLICY "Admins manage saccos"
  ON public.saccos FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- member_accounts
-- =============================================================

DROP POLICY IF EXISTS "Admins manage member accounts" ON public.member_accounts;
CREATE POLICY "Admins manage member accounts"
  ON public.member_accounts FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- loan_products
-- =============================================================

DROP POLICY IF EXISTS "Authenticated read loan products" ON public.loan_products;
CREATE POLICY "Authenticated read loan products"
  ON public.loan_products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage loan products" ON public.loan_products;
CREATE POLICY "Admins manage loan products"
  ON public.loan_products FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- loan_applications
-- =============================================================

DROP POLICY IF EXISTS "Users view own loan applications" ON public.loan_applications;
CREATE POLICY "Users view own loan applications"
  ON public.loan_applications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own loan applications" ON public.loan_applications;
CREATE POLICY "Users create own loan applications"
  ON public.loan_applications FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage loan applications" ON public.loan_applications;
CREATE POLICY "Admins manage loan applications"
  ON public.loan_applications FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- transactions
-- =============================================================

DROP POLICY IF EXISTS "Users view own transactions" ON public.transactions;
CREATE POLICY "Users view own transactions"
  ON public.transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR member_account_id IN (
      SELECT ma.id
      FROM public.member_accounts ma
      JOIN public.sacco_memberships sm ON sm.id = ma.sacco_membership_id
      WHERE sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage transactions" ON public.transactions;
CREATE POLICY "Admins manage transactions"
  ON public.transactions FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- interest_postings
-- =============================================================

DROP POLICY IF EXISTS "Admins manage interest postings" ON public.interest_postings;
CREATE POLICY "Admins manage interest postings"
  ON public.interest_postings FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- audit_logs (add admin write; existing admin read stays)
-- =============================================================

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- notifications  (RLS was OFF)
-- =============================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- savings_goals  (RLS was OFF)
-- =============================================================

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own savings goals" ON public.savings_goals;
CREATE POLICY "Users manage own savings goals"
  ON public.savings_goals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read savings goals" ON public.savings_goals;
CREATE POLICY "Admins read savings goals"
  ON public.savings_goals FOR SELECT
  USING (public.is_sacco_admin());

-- =============================================================
-- fixed_deposits  (RLS was OFF)
-- =============================================================

ALTER TABLE public.fixed_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own fixed deposits" ON public.fixed_deposits;
CREATE POLICY "Users view own fixed deposits"
  ON public.fixed_deposits FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage fixed deposits" ON public.fixed_deposits;
CREATE POLICY "Admins manage fixed deposits"
  ON public.fixed_deposits FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- credit_scores  (RLS was OFF)
-- =============================================================

ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own credit score" ON public.credit_scores;
CREATE POLICY "Users view own credit score"
  ON public.credit_scores FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage credit scores" ON public.credit_scores;
CREATE POLICY "Admins manage credit scores"
  ON public.credit_scores FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- dividends  (RLS was OFF)
-- =============================================================

ALTER TABLE public.dividends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read dividends" ON public.dividends;
CREATE POLICY "Authenticated read dividends"
  ON public.dividends FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage dividends" ON public.dividends;
CREATE POLICY "Admins manage dividends"
  ON public.dividends FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- member_dividends  (RLS was OFF)
-- =============================================================

ALTER TABLE public.member_dividends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own dividends" ON public.member_dividends;
CREATE POLICY "Users view own dividends"
  ON public.member_dividends FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage member dividends" ON public.member_dividends;
CREATE POLICY "Admins manage member dividends"
  ON public.member_dividends FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());

-- =============================================================
-- loan_repayment_schedule  (RLS was OFF)
-- =============================================================

ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own loan schedule" ON public.loan_repayment_schedule;
CREATE POLICY "Users view own loan schedule"
  ON public.loan_repayment_schedule FOR SELECT
  USING (
    loan_application_id IN (
      SELECT id FROM public.loan_applications WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage loan schedules" ON public.loan_repayment_schedule;
CREATE POLICY "Admins manage loan schedules"
  ON public.loan_repayment_schedule FOR ALL
  USING (public.is_sacco_admin())
  WITH CHECK (public.is_sacco_admin());
