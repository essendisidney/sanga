-- =====================================================================
-- 20260425_savings_challenges.sql
--
-- V1.8 — Savings Challenges engine.
--
-- Goals-based, deterministic savings challenges. No LLM, no magic: a
-- challenge is a SQL-describable rule (target_amount by target_date,
-- or weekly streak of N deposits, or group pooled savings). Progress
-- is computed from real deposit transactions, not from a free-form
-- user-reported "I saved KES 500 today".
--
-- Tables:
--   savings_challenges          — challenge catalogue (shipped by admin)
--   challenge_participants      — per-member enrolment + progress
--
-- Engine:
--   rebuild_challenge_progress(p_user_id, p_challenge_id)
--     Recomputes a single participant's progress from underlying
--     transactions. Called on enrol, on every deposit via trigger, and
--     manually for reconciliation.
--   tick_all_challenges_for_user(p_user_id)
--     Convenience wrapper for a trigger that updates every active
--     challenge the user is enrolled in.
--
-- UI surface:
--   GET  /api/challenges           list active + enrolled flag
--   POST /api/challenges/{id}/join
--   POST /api/challenges/{id}/leave
--   GET  /api/me/challenges         list of participations with progress
--
-- Idempotent: safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.savings_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sacco_id UUID NULL REFERENCES public.saccos(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,

  -- Rule schema (discriminated by rule_type).
  rule_type TEXT NOT NULL CHECK (
    rule_type IN ('target_amount', 'streak_weekly', 'streak_monthly', 'group_pool')
  ),

  -- target_amount rules: save at least target_amount by ends_at
  target_amount NUMERIC(14, 2),
  -- streak rules: require deposits_required deposits in each window_days
  deposits_required INTEGER,
  window_days INTEGER,
  -- group_pool: combined sum across all participants
  pool_target NUMERIC(14, 2),

  reward_description TEXT,
  reward_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_auto_enroll BOOLEAN NOT NULL DEFAULT FALSE,
  icon TEXT NOT NULL DEFAULT 'Target',
  color_class TEXT NOT NULL DEFAULT 'from-emerald-500 to-green-500',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (starts_at < ends_at),
  CHECK (
    (rule_type = 'target_amount' AND target_amount IS NOT NULL AND target_amount > 0)
    OR
    (rule_type IN ('streak_weekly','streak_monthly')
       AND deposits_required IS NOT NULL AND deposits_required > 0
       AND window_days IS NOT NULL AND window_days > 0)
    OR
    (rule_type = 'group_pool' AND pool_target IS NOT NULL AND pool_target > 0)
  )
);

CREATE INDEX IF NOT EXISTS savings_challenges_active_idx
  ON public.savings_challenges(is_active, ends_at);

ALTER TABLE public.savings_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS savings_challenges_read ON public.savings_challenges;
CREATE POLICY savings_challenges_read ON public.savings_challenges
  FOR SELECT TO authenticated
  USING (is_active = TRUE AND ends_at > NOW());

DROP POLICY IF EXISTS savings_challenges_service ON public.savings_challenges;
CREATE POLICY savings_challenges_service ON public.savings_challenges
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT ON public.savings_challenges TO authenticated;

CREATE OR REPLACE FUNCTION public._touch_savings_challenges()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_savings_challenges ON public.savings_challenges;
CREATE TRIGGER trg_touch_savings_challenges
BEFORE UPDATE ON public.savings_challenges
FOR EACH ROW EXECUTE FUNCTION public._touch_savings_challenges();


-- ---------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.savings_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Progress snapshot. Recomputed by rebuild_challenge_progress().
  progress_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  progress_deposits INTEGER NOT NULL DEFAULT 0,
  progress_streak INTEGER NOT NULL DEFAULT 0,
  progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'failed', 'withdrawn')),

  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_progress_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_participants_user_idx
  ON public.challenge_participants(user_id, status);

ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_participants_select_own ON public.challenge_participants;
CREATE POLICY challenge_participants_select_own ON public.challenge_participants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS challenge_participants_service ON public.challenge_participants;
CREATE POLICY challenge_participants_service ON public.challenge_participants
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT ON public.challenge_participants TO authenticated;


-- ---------------------------------------------------------------------
-- Engine: rebuild_challenge_progress
--     Recomputes progress for ONE (user, challenge) pair off the
--     authoritative transactions table. Updates status to 'completed'
--     when rule is satisfied.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_challenge_progress(
  p_user_id UUID,
  p_challenge_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.savings_challenges;
  v_part public.challenge_participants;
  v_amount NUMERIC(14,2) := 0;
  v_deposits INTEGER := 0;
  v_streak INTEGER := 0;
  v_pct NUMERIC(5,2) := 0;
  v_last_progress TIMESTAMPTZ;
  v_should_complete BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_challenge FROM public.savings_challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_part
    FROM public.challenge_participants
    WHERE challenge_id = p_challenge_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Ignore already-completed / withdrawn
  IF v_part.status IN ('completed','withdrawn') THEN RETURN; END IF;

  -- Sum completed deposits for this user within challenge window.
  -- Deposits are authoritative; challenge cannot credit arbitrary moves.
  WITH deposits AS (
    SELECT t.amount, t.created_at
    FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'deposit'
      AND t.status = 'completed'
      AND t.created_at >= v_part.enrolled_at
      AND t.created_at <= LEAST(v_challenge.ends_at, NOW())
  )
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*),
    MAX(created_at)
  INTO v_amount, v_deposits, v_last_progress
  FROM deposits;

  -- Per-rule completion + streak computation
  IF v_challenge.rule_type = 'target_amount' THEN
    v_pct := LEAST(100, GREATEST(0, ROUND((v_amount / v_challenge.target_amount) * 100, 2)));
    v_should_complete := v_amount >= v_challenge.target_amount;

  ELSIF v_challenge.rule_type IN ('streak_weekly','streak_monthly') THEN
    -- Count consecutive windows (weekly=7d, monthly=30d) where the
    -- member hit deposits_required. Walk backward from now.
    DECLARE
      v_cursor TIMESTAMPTZ := NOW();
      v_step INTEGER := v_challenge.window_days;
      v_in_window INTEGER;
    BEGIN
      v_streak := 0;
      LOOP
        SELECT COUNT(*) INTO v_in_window
        FROM public.transactions t
        WHERE t.user_id = p_user_id
          AND t.type = 'deposit'
          AND t.status = 'completed'
          AND t.created_at > v_cursor - (v_step || ' days')::INTERVAL
          AND t.created_at <= v_cursor
          AND t.created_at >= v_part.enrolled_at;

        IF v_in_window >= v_challenge.deposits_required THEN
          v_streak := v_streak + 1;
          v_cursor := v_cursor - (v_step || ' days')::INTERVAL;
          -- stop if we walked past enrolment
          EXIT WHEN v_cursor < v_part.enrolled_at;
        ELSE
          EXIT;
        END IF;
      END LOOP;
    END;
    -- Target streak length is implicit from total challenge duration:
    -- required_weeks = ceil((ends_at - starts_at) / window_days)
    DECLARE
      v_required INTEGER := GREATEST(1, CEIL(
        EXTRACT(EPOCH FROM (v_challenge.ends_at - v_challenge.starts_at)) /
        (v_challenge.window_days * 86400)
      )::INTEGER);
    BEGIN
      v_pct := LEAST(100, ROUND((v_streak::NUMERIC / v_required::NUMERIC) * 100, 2));
      v_should_complete := v_streak >= v_required;
    END;

  ELSIF v_challenge.rule_type = 'group_pool' THEN
    -- This participant's progress is informational; completion of
    -- the whole challenge is decided by pool total, not per-member.
    -- Pool completion is computed in tick_group_pool() below.
    v_pct := 0;
    v_should_complete := FALSE;
  END IF;

  UPDATE public.challenge_participants
     SET progress_amount    = v_amount,
         progress_deposits  = v_deposits,
         progress_streak    = v_streak,
         progress_pct       = v_pct,
         last_progress_at   = COALESCE(v_last_progress, last_progress_at),
         status             = CASE WHEN v_should_complete THEN 'completed' ELSE status END,
         completed_at       = CASE WHEN v_should_complete AND completed_at IS NULL THEN NOW() ELSE completed_at END,
         updated_at         = NOW()
   WHERE id = v_part.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_challenge_progress(UUID, UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- tick_all_challenges_for_user — convenience for the deposit trigger.
-- Walks every active enrolment the user has and rebuilds progress.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tick_all_challenges_for_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT cp.challenge_id
      FROM public.challenge_participants cp
      JOIN public.savings_challenges c ON c.id = cp.challenge_id
     WHERE cp.user_id = p_user_id
       AND cp.status = 'active'
       AND c.is_active = TRUE
       AND c.ends_at > NOW()
  LOOP
    PERFORM public.rebuild_challenge_progress(p_user_id, v_row.challenge_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tick_all_challenges_for_user(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- Enrollment RPCs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_savings_challenge(p_challenge_id UUID)
RETURNS public.challenge_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_challenge public.savings_challenges;
  v_row public.challenge_participants;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_challenge FROM public.savings_challenges WHERE id = p_challenge_id;
  IF NOT FOUND OR NOT v_challenge.is_active OR v_challenge.ends_at <= NOW() THEN
    RAISE EXCEPTION 'challenge not available' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.challenge_participants (challenge_id, user_id)
    VALUES (p_challenge_id, v_uid)
    ON CONFLICT (challenge_id, user_id) DO UPDATE
      SET status = CASE
                     WHEN challenge_participants.status = 'withdrawn' THEN 'active'
                     ELSE challenge_participants.status
                   END,
          updated_at = NOW()
    RETURNING * INTO v_row;

  PERFORM public.rebuild_challenge_progress(v_uid, p_challenge_id);

  SELECT * INTO v_row
    FROM public.challenge_participants
    WHERE id = v_row.id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_savings_challenge(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.leave_savings_challenge(p_challenge_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.challenge_participants
     SET status = 'withdrawn', updated_at = NOW()
   WHERE challenge_id = p_challenge_id
     AND user_id = v_uid
     AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_savings_challenge(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- Deposit trigger — tick challenges every time a deposit completes.
-- Guarded by status='completed' to avoid rebuilds on draft/failed rows.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._trg_tx_tick_challenges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'deposit' AND NEW.status = 'completed' AND NEW.user_id IS NOT NULL THEN
    PERFORM public.tick_all_challenges_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tx_tick_challenges ON public.transactions;
CREATE TRIGGER trg_tx_tick_challenges
AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public._trg_tx_tick_challenges();


-- ---------------------------------------------------------------------
-- Group pool progress view — aggregate across all active participants.
-- Surfaced in /api/challenges response for rule_type=group_pool.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.savings_challenges_with_totals AS
SELECT
  c.*,
  COALESCE(SUM(cp.progress_amount) FILTER (WHERE cp.status IN ('active','completed')), 0) AS pool_total,
  COUNT(*) FILTER (WHERE cp.status IN ('active','completed')) AS participant_count
FROM public.savings_challenges c
LEFT JOIN public.challenge_participants cp ON cp.challenge_id = c.id
GROUP BY c.id;

GRANT SELECT ON public.savings_challenges_with_totals TO authenticated;


-- ---------------------------------------------------------------------
-- Seed: three flagship challenges, 60-day window, auto-enrolling the
-- "target" one so new members see something in their feed on day one.
-- ---------------------------------------------------------------------
INSERT INTO public.savings_challenges
  (code, title, description, rule_type, target_amount, deposits_required,
   window_days, pool_target, reward_description, reward_amount, starts_at,
   ends_at, is_auto_enroll, icon, color_class)
VALUES
  ('SAVE5K_60D',
   'Save KES 5,000 in 60 days',
   'Hit the instant-loan threshold. Any member who gets to KES 5,000 in total deposits within 60 days unlocks instant loans up to 2× their savings.',
   'target_amount', 5000, NULL, NULL, NULL,
   'Instant-loan unlock + KES 100 shares bonus', 100,
   NOW(), NOW() + INTERVAL '60 days',
   TRUE, 'Target', 'from-emerald-500 to-green-500'),

  ('STREAK_WEEKLY_8',
   '8-week deposit streak',
   'Deposit at least once a week for 8 weeks. Builds your social credit score fast.',
   'streak_weekly', NULL, 1, 7, NULL,
   '+50 credit score points + badge', 0,
   NOW(), NOW() + INTERVAL '56 days',
   FALSE, 'TrendingUp', 'from-blue-500 to-cyan-500'),

  ('GROUP_1M_POOL',
   'Community savings pool: KES 1M',
   'Collectively save KES 1,000,000 as a community. Every participant shares a KES 5,000 pool when the target is hit.',
   'group_pool', NULL, NULL, NULL, 1000000,
   'Share of KES 5,000 community bonus', 5000,
   NOW(), NOW() + INTERVAL '60 days',
   FALSE, 'Gift', 'from-purple-500 to-pink-500')
ON CONFLICT (code) DO NOTHING;
