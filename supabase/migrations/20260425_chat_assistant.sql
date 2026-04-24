-- =====================================================================
-- 20260425_chat_assistant.sql
--
-- V1.8 — Chat Assistant schema.
--
-- Tables:
--   chat_conversations    — one row per user; created on first message
--   chat_messages         — role-tagged message history
--   chat_usage_daily      — per-user per-day counters for cost/rate caps
--
-- Design notes:
--   * We rate-limit in SQL (incr RPC that enforces caps atomically) so
--     two concurrent LLM calls can't both slip past the cap.
--   * Costs stored in USD micros to avoid floating-point drift.
--   * RLS: users read/insert their own conversations + messages only.
--   * Service role does everything (webhook / admin tooling).
--
-- Idempotent: safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON public.chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx
  ON public.chat_messages(user_id, created_at);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conv_select_own ON public.chat_conversations;
CREATE POLICY chat_conv_select_own ON public.chat_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conv_insert_own ON public.chat_conversations;
CREATE POLICY chat_conv_insert_own ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conv_service ON public.chat_conversations;
CREATE POLICY chat_conv_service ON public.chat_conversations
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS chat_msg_select_own ON public.chat_messages;
CREATE POLICY chat_msg_select_own ON public.chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_msg_insert_own ON public.chat_messages;
CREATE POLICY chat_msg_insert_own ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_msg_service ON public.chat_messages;
CREATE POLICY chat_msg_service ON public.chat_messages
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT, INSERT ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;


-- ---------------------------------------------------------------------
-- Usage counters (per user per day).
-- cost_micros = USD * 1,000,000 to stay in integers.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens_in BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, usage_date)
);

ALTER TABLE public.chat_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_usage_select_own ON public.chat_usage_daily;
CREATE POLICY chat_usage_select_own ON public.chat_usage_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_usage_service ON public.chat_usage_daily;
CREATE POLICY chat_usage_service ON public.chat_usage_daily
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT ON public.chat_usage_daily TO authenticated;


-- ---------------------------------------------------------------------
-- enforce_chat_quota(p_user_id, p_max_requests_per_day, p_max_cost_micros_per_day)
--     Atomic: increments request count by 1. Returns whether the call
--     is allowed and the current counters. Call BEFORE making the LLM
--     call; on success make the call, then call record_chat_usage() to
--     add the real token/cost numbers.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_chat_quota(
  p_user_id UUID,
  p_max_requests_per_day INTEGER DEFAULT 50,
  p_max_cost_micros_per_day BIGINT DEFAULT 100000  -- $0.10/day by default
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  requests INTEGER,
  cost_micros BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.chat_usage_daily;
BEGIN
  INSERT INTO public.chat_usage_daily (user_id, usage_date, requests, last_request_at)
    VALUES (p_user_id, CURRENT_DATE, 1, NOW())
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET requests = chat_usage_daily.requests + 1,
          last_request_at = NOW(),
          updated_at = NOW()
    RETURNING * INTO v_row;

  IF v_row.requests > p_max_requests_per_day THEN
    -- Roll back the increment we just made, by decrementing.
    UPDATE public.chat_usage_daily
       SET requests = GREATEST(0, requests - 1)
     WHERE id = v_row.id;
    allowed := FALSE;
    reason := 'daily_request_limit';
    requests := v_row.requests - 1;
    cost_micros := v_row.cost_micros;
    RETURN NEXT; RETURN;
  END IF;

  IF v_row.cost_micros >= p_max_cost_micros_per_day THEN
    UPDATE public.chat_usage_daily
       SET requests = GREATEST(0, requests - 1)
     WHERE id = v_row.id;
    allowed := FALSE;
    reason := 'daily_cost_limit';
    requests := v_row.requests - 1;
    cost_micros := v_row.cost_micros;
    RETURN NEXT; RETURN;
  END IF;

  allowed := TRUE;
  reason := 'ok';
  requests := v_row.requests;
  cost_micros := v_row.cost_micros;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_chat_quota(UUID, INTEGER, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_chat_quota(UUID, INTEGER, BIGINT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.record_chat_usage(
  p_user_id UUID,
  p_tokens_in INTEGER,
  p_tokens_out INTEGER,
  p_cost_micros INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_usage_daily
    (user_id, usage_date, requests, tokens_in, tokens_out, cost_micros, last_request_at)
    VALUES (p_user_id, CURRENT_DATE, 0, p_tokens_in, p_tokens_out, p_cost_micros, NOW())
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET tokens_in = chat_usage_daily.tokens_in + p_tokens_in,
          tokens_out = chat_usage_daily.tokens_out + p_tokens_out,
          cost_micros = chat_usage_daily.cost_micros + p_cost_micros,
          last_request_at = NOW(),
          updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.record_chat_usage(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_chat_usage(UUID, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;
