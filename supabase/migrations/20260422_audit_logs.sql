-- Audit trail for sensitive actions (logins, transactions, admin decisions).
-- Table is append-only from the app layer. RLS blocks direct reads for non-admins.

create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  action        text not null,
  details       jsonb,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;

-- Only admins/managers may read the log. No one may update/delete.
create policy "audit_logs_admin_read" on public.audit_logs
  for select
  using (
    exists (
      select 1
      from public.sacco_memberships m
      where m.user_id = auth.uid()
        and m.role in ('admin', 'manager')
    )
  );

-- Inserts happen through the service-role/server client, which bypasses RLS.
-- Denying public insert keeps clients from spamming the table directly.
revoke insert on public.audit_logs from anon, authenticated;
