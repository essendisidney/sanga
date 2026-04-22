-- Race-safe member_number generation.
--
-- Previously lib/members/member-number.ts computed member_number in the
-- application layer as:
--
--     SELECT count(*) + 1 FROM sacco_memberships WHERE sacco_id = ?
--
-- which races under concurrent inserts (two bulk imports hitting at the
-- same millisecond both see count=N and both produce SGA-YYYY-(N+1)).
-- This migration moves generation into Postgres via a sequence + BEFORE
-- INSERT trigger so the DB is the single source of truth.
--
-- Semantics:
--   * The sequence is global, not per-year or per-SACCO. The year is
--     rendered into the string for readability; if inserts straddle a
--     year boundary you get SGA-2026-999998, SGA-2027-999999,
--     SGA-2027-1000000, etc. That's fine.
--   * Failed inserts consume numbers (Postgres never rolls back nextval).
--     Gaps in the member_number series are expected and not a bug.
--   * Callers should omit member_number on insert; the trigger fills it.
--     Callers that *do* supply a non-null/non-empty value are respected
--     (needed for migrations from legacy systems).

CREATE SEQUENCE IF NOT EXISTS public.member_number_seq START 1;

CREATE OR REPLACE FUNCTION public.set_member_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_number IS NULL OR NEW.member_number = '' THEN
    NEW.member_number :=
      'SGA-' || to_char(now(), 'YYYY')
             || '-'
             || lpad(nextval('public.member_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_member_number ON public.sacco_memberships;
CREATE TRIGGER trg_set_member_number
  BEFORE INSERT ON public.sacco_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_number();

-- Seed the sequence past any existing member numbers so we don't collide
-- with rows created by the old race-prone code path.
DO $$
DECLARE
  v_max bigint;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN member_number ~ '^SGA-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(member_number, '^SGA-[0-9]{4}-([0-9]+)$'))[1]::bigint
      ELSE NULL
    END
  ), 0) INTO v_max
  FROM public.sacco_memberships;

  IF v_max > 0 THEN
    PERFORM setval('public.member_number_seq', v_max);
  END IF;
END;
$$;

-- Enforce per-SACCO uniqueness. With a global sequence this is already
-- implicitly unique, but the constraint catches any stray manual inserts
-- (and any residual duplicates from the race era — fix them before
-- applying this migration if present).
CREATE UNIQUE INDEX IF NOT EXISTS sacco_memberships_sacco_member_number_key
  ON public.sacco_memberships (sacco_id, member_number);
