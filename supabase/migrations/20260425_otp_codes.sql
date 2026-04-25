-- =====================================================================
-- OTP codes table: persistent, cross-instance OTP storage.
-- Replaces the in-memory / Redis backed store used by send-otp / verify-otp.
--
-- Why DB-backed:
--   - Vercel serverless functions don't share memory across instances,
--     so a Map-backed fallback flapped between "OTP found" and "OTP not
--     found" depending on which instance a verify request landed on.
--   - Redis worked but required Upstash env vars that weren't set in prod,
--     so the system silently fell back to per-instance memory.
--   - Postgres is the source of truth the rest of the app already trusts.
--
-- Security:
--   - RLS is enabled and intentionally has NO policies for anon/auth.
--   - Service role (used by lib/sms/otp-store.ts via createAdminClient)
--     bypasses RLS, which is exactly what we want for an auth-bootstrap
--     resource that must be accessible BEFORE the user is authenticated.
--   - OTP codes are short-lived (10m) and cleaned by clean_expired_otps().
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON public.otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_active
  ON public.otp_codes(phone, created_at DESC)
  WHERE is_used = FALSE;

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- No policies are created. anon + authenticated have zero access.
-- Service role bypasses RLS and is the only path in/out.

REVOKE ALL ON public.otp_codes FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Cleanup function: deletes anything past expiry.
-- Called by /api/cron/cleanup-otp on a Vercel Cron schedule.
-- SECURITY DEFINER so it runs with table owner privileges; we still
-- only grant EXECUTE to service_role to keep it off the public surface.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clean_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.otp_codes WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_expired_otps() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_expired_otps() TO service_role;
