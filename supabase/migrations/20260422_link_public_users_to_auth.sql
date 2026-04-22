-- Keep public.users.id == auth.users.id going forward.
--
-- The admin/users → sacco_memberships RLS policy assumes
-- `(user_id = auth.uid())`. auth.uid() returns auth.users.id, so any row
-- in public.users created with a fresh gen_random_uuid() will fail RLS
-- for its owner. This trigger mirrors auth.users.id into public.users.id
-- whenever a new auth user signs up.
--
-- A one-off relink of the existing admin account (ae70a442 → 8155f889)
-- was done in production via the MCP SQL runner; future users flow
-- through this trigger automatically.
--
-- Behaviour:
--   * Fires on auth.users insert.
--   * Inserts a minimal public.users row (phone from auth.users.phone
--     or the email wrapper `u<phone>@phone.sanga` we use for SMS OTP).
--   * Uses ON CONFLICT DO NOTHING so manual backfills or races don't
--     trip the unique constraints.
--   * full_name and national_id are NOT NULL in public.users, so we
--     stub them with placeholders that the onboarding UI must overwrite.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := COALESCE(
    NEW.phone,
    regexp_replace(COALESCE(NEW.email, ''), '^u([0-9]+)@phone\.sanga$', '\1'),
    NEW.id::text
  );

  INSERT INTO public.users (id, phone, national_id, full_name)
  VALUES (
    NEW.id,
    v_phone,
    'PENDING-' || substr(NEW.id::text, 1, 8),
    'Pending Onboarding'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
