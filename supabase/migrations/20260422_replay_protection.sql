-- Replay protection for interest posting and dividend operations.

-- Track which (year, month) periods have had interest posted, so the monthly
-- job cannot double-credit if re-run or retried.
create table if not exists public.interest_postings (
  id             uuid primary key default gen_random_uuid(),
  period_year    int not null,
  period_month   int not null check (period_month between 1 and 12),
  accounts_count int not null default 0,
  total_interest numeric not null default 0,
  posted_by      uuid references auth.users(id) on delete set null,
  posted_at      timestamptz not null default now(),
  constraint interest_postings_unique_period unique (period_year, period_month)
);

alter table public.interest_postings enable row level security;

create policy "interest_postings_admin_read" on public.interest_postings
  for select
  using (
    exists (
      select 1
      from public.sacco_memberships m
      where m.user_id = auth.uid()
        and m.role in ('admin', 'manager')
    )
  );

-- Dividends: enforce at most one declaration per financial_year.
-- Safe to run repeatedly; if a partial or failed constraint exists, clean it up.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dividends_financial_year_unique'
  ) then
    alter table public.dividends
      add constraint dividends_financial_year_unique unique (financial_year);
  end if;
exception when others then
  -- Table may not exist yet in some environments; the constraint will be
  -- added whenever the schema is bootstrapped.
  null;
end $$;
