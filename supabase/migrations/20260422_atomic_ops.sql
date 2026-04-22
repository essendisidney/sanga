-- Atomic money-movement RPCs. Each function runs in its own Postgres
-- transaction, uses SELECT ... FOR UPDATE row locks, and returns the new
-- balance. Callers (teller UI, goal contribution, interest, dividend) should
-- invoke these via supabase.rpc() instead of doing read-modify-write from
-- the app layer.

-- ---------------------------------------------------------------------------
-- process_teller_transaction: debit or credit a member account and write a
-- transactions ledger row atomically. Raises if the account is missing or
-- would go negative on a withdrawal.
-- ---------------------------------------------------------------------------
create or replace function public.process_teller_transaction(
  p_user_id uuid,
  p_account_id uuid,
  p_type text,             -- 'deposit' | 'withdrawal'
  p_amount numeric,
  p_description text default null
)
returns table (
  transaction_id uuid,
  new_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new_balance numeric;
  v_tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if p_type not in ('deposit', 'withdrawal') then
    raise exception 'type must be deposit or withdrawal';
  end if;

  -- Lock the account row for this transaction
  select balance into v_balance
  from public.member_accounts
  where id = p_account_id
  for update;

  if v_balance is null then
    raise exception 'account not found';
  end if;

  if p_type = 'deposit' then
    v_new_balance := v_balance + p_amount;
  else
    if v_balance < p_amount then
      raise exception 'insufficient funds';
    end if;
    v_new_balance := v_balance - p_amount;
  end if;

  update public.member_accounts
    set balance = v_new_balance,
        updated_at = now()
  where id = p_account_id;

  insert into public.transactions (
    user_id, member_account_id, type, amount,
    balance_before, balance_after, status, description, completed_at
  ) values (
    p_user_id, p_account_id, p_type, p_amount,
    v_balance, v_new_balance, 'completed',
    coalesce(p_description,
      case when p_type = 'deposit' then 'Cash deposit at teller'
           else 'Cash withdrawal at teller' end),
    now()
  ) returning id into v_tx_id;

  transaction_id := v_tx_id;
  new_balance := v_new_balance;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- contribute_to_goal: atomically increment savings_goals.current_amount,
-- enforcing the goal belongs to the caller and the new total does not exceed
-- target_amount.
-- ---------------------------------------------------------------------------
create or replace function public.contribute_to_goal(
  p_goal_id uuid,
  p_user_id uuid,
  p_amount numeric
)
returns table (
  new_current_amount numeric,
  target_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_target numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  select current_amount, target_amount into v_current, v_target
  from public.savings_goals
  where id = p_goal_id
    and user_id = p_user_id
  for update;

  if v_current is null then
    raise exception 'goal not found';
  end if;

  if v_current + p_amount > v_target then
    raise exception 'contribution exceeds goal target';
  end if;

  update public.savings_goals
    set current_amount = v_current + p_amount,
        updated_at = now()
  where id = p_goal_id;

  new_current_amount := v_current + p_amount;
  target_amount := v_target;
  return next;
end;
$$;

-- Permissions: callers are always authenticated (server-side supabase client
-- uses the user's JWT). Only the owning user can see their goal, and only
-- admins should reach process_teller_transaction from API routes.
revoke all on function public.process_teller_transaction(uuid, uuid, text, numeric, text) from public;
grant execute on function public.process_teller_transaction(uuid, uuid, text, numeric, text) to authenticated;

revoke all on function public.contribute_to_goal(uuid, uuid, numeric) from public;
grant execute on function public.contribute_to_goal(uuid, uuid, numeric) to authenticated;
