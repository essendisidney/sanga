-- =====================================================================
-- 20260424_experience_mode_and_ussd.sql
--
-- V1.6 — UI that adapts to user preference + USSD foundation
--
-- This migration:
--   1. Adds an `experience_mode` column to public.user_personas so a
--      member's preferred dashboard layout follows them across devices.
--   2. Adds a `ussd_pin_hash` column to public.users so members can
--      authorise USSD write operations (loan apply, withdraw) once a
--      PIN is set. Read-only USSD operations (balance, recent tx,
--      eligibility) work without a PIN.
--   3. Provides a `set_experience_mode(p_mode)` SECURITY DEFINER RPC
--      so the API can upsert the preference without the caller needing
--      to be the row's owner first (handles the no-row case cleanly).
--   4. Provides a `set_ussd_pin(p_pin)` SECURITY DEFINER RPC that
--      stores a salted hash (pgcrypto crypt + bf) — the plain PIN
--      never lands in the database.
--   5. Provides a `verify_ussd_pin(p_phone, p_pin)` SECURITY DEFINER
--      helper for the USSD webhook (which runs as service-role) to
--      authenticate a session by phone number + PIN.
--
-- Idempotent: safe to run multiple times.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. user_personas.experience_mode
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_personas'
      AND column_name = 'experience_mode'
  ) THEN
    ALTER TABLE public.user_personas
      ADD COLUMN experience_mode TEXT NOT NULL DEFAULT 'digital'
      CHECK (experience_mode IN ('digital','simplified','hybrid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_personas_mode_idx
  ON public.user_personas(experience_mode);

-- ---------------------------------------------------------------------
-- 2. users.ussd_pin_hash + users.ussd_pin_set_at
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'ussd_pin_hash'
  ) THEN
    ALTER TABLE public.users ADD COLUMN ussd_pin_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'ussd_pin_set_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN ussd_pin_set_at TIMESTAMPTZ;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. set_experience_mode(p_mode)
--    Called by /api/me/preferences PATCH. Upserts the persona row.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_experience_mode(p_mode TEXT)
RETURNS TABLE (
  user_id UUID,
  experience_mode TEXT,
  persona_type TEXT,
  updated_at TIMESTAMPTZ
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

  IF p_mode NOT IN ('digital','simplified','hybrid') THEN
    RAISE EXCEPTION 'invalid experience mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_personas (user_id, experience_mode, derived_from)
  VALUES (v_user, p_mode, 'self_declared')
  ON CONFLICT (user_id) DO UPDATE
    SET experience_mode = EXCLUDED.experience_mode,
        derived_from    = 'self_declared',
        updated_at      = NOW();

  RETURN QUERY
    SELECT up.user_id, up.experience_mode, up.persona_type, up.updated_at
    FROM public.user_personas up
    WHERE up.user_id = v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_experience_mode(TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. set_ussd_pin(p_pin) — stores salted bf hash
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ussd_pin(p_pin TEXT)
RETURNS BOOLEAN
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

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
  SET ussd_pin_hash    = crypt(p_pin, gen_salt('bf', 10)),
      ussd_pin_set_at  = NOW()
  WHERE id = v_user;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ussd_pin(TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. verify_ussd_pin(p_phone, p_pin) — for the USSD webhook
--    Returns the user row id on success, NULL on failure.
--    SECURITY DEFINER because the USSD webhook runs as service-role and
--    needs to look up users by phone (RLS would normally block this).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_ussd_pin(p_phone TEXT, p_pin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_hash TEXT;
  v_no_plus TEXT := CASE WHEN p_phone LIKE '+%' THEN substring(p_phone FROM 2) ELSE p_phone END;
  v_with_plus TEXT := CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END;
BEGIN
  IF p_phone IS NULL OR p_pin IS NULL THEN RETURN NULL; END IF;

  -- Phones are stored inconsistently across historical imports
  -- (some with '+' prefix, some without). Match either form.
  SELECT id, ussd_pin_hash
    INTO v_user_id, v_hash
  FROM public.users
  WHERE phone IN (p_phone, v_no_plus, v_with_plus)
  LIMIT 1;

  IF v_user_id IS NULL OR v_hash IS NULL THEN RETURN NULL; END IF;

  IF crypt(p_pin, v_hash) = v_hash THEN
    RETURN v_user_id;
  END IF;

  RETURN NULL;
END;
$$;

-- only callable by service role (NOT authenticated). The USSD webhook
-- talks to Postgres with the service role key.
REVOKE ALL ON FUNCTION public.verify_ussd_pin(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_ussd_pin(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ussd_pin(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 6. lookup_user_by_phone(p_phone) — read-only USSD helper
--    Used so the USSD webhook can answer balance / recent tx queries
--    without a PIN (the SIM holder already has practical access to
--    those via SMS support requests). Returns minimal info.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_user_by_phone(p_phone TEXT)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  has_pin BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Phones are stored inconsistently across historical imports
  -- (some with '+' prefix, some without). Match either form and
  -- prefer the exact match if present.
  WITH variants AS (
    SELECT
      CASE WHEN p_phone LIKE '+%' THEN substring(p_phone FROM 2) ELSE p_phone END AS no_plus,
      CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END AS with_plus
  )
  SELECT u.id, u.full_name, (u.ussd_pin_hash IS NOT NULL)
  FROM public.users u, variants v
  WHERE u.phone = p_phone
     OR u.phone = v.no_plus
     OR u.phone = v.with_plus
  ORDER BY (u.phone = p_phone) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_user_by_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_user_by_phone(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_user_by_phone(TEXT) TO service_role;
