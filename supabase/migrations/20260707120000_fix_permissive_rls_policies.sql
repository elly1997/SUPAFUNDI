-- Supabase lint 0024: remove permissive authenticated_full_access policies.
-- Safe for HardwarePOS: org-scoped policies (e.g. bank_accounts_all) are kept or created
-- before dropping authenticated_full_access. Tables without organization_id are skipped.

create or replace function public.get_auth_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid())
  limit 1;
$$;

comment on function public.get_auth_organization_id() is
  'Returns the caller profile organization_id; SECURITY DEFINER avoids RLS recursion.';

create or replace function public._fix_permissive_rls_for_table(p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regclass regclass;
  v_has_org boolean;
  v_other_policies integer;
  v_policy_name text;
begin
  v_regclass := to_regclass(format('public.%I', p_table));
  if v_regclass is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = p_table
      and policyname = 'authenticated_full_access'
  ) then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = 'organization_id'
  ) into v_has_org;

  select count(*)::integer
  into v_other_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = p_table
    and policyname <> 'authenticated_full_access';

  if v_has_org and v_other_policies = 0 then
    v_policy_name := p_table || '_all';
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id = public.get_auth_organization_id()) with check (organization_id = public.get_auth_organization_id())',
      v_policy_name,
      p_table
    );
  elsif not v_has_org and v_other_policies = 0 then
    raise notice 'Skipped % — has authenticated_full_access but no organization_id and no replacement policy',
      p_table;
    return;
  end if;

  execute format(
    'drop policy authenticated_full_access on public.%I',
    p_table
  );
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and policyname = 'authenticated_full_access'
    order by tablename
  loop
    perform public._fix_permissive_rls_for_table(r.tablename);
  end loop;
end;
$$;

-- Explicit pass for tables flagged in Supabase linter export (no-op if already fixed).
select public._fix_permissive_rls_for_table(t)
from unnest(array[
  'bank_accounts',
  'bank_deposits',
  'bill_items',
  'bills',
  'branch_features',
  'branch_item_prices',
  'branches',
  'bulk_sms_audit_log',
  'cleaning_expenses',
  'daily_cash_summaries',
  'delivery_notes',
  'employees',
  'expense_audit_log',
  'expense_categories',
  'expenses',
  'invoice_items',
  'invoice_payments',
  'invoices',
  'loyalty_points',
  'loyalty_rewards',
  'loyalty_transactions',
  'notifications',
  'order_item_photos',
  'order_transfers',
  'payment_audit_log',
  'payroll_monthly',
  'payroll_periods',
  'salary_advances',
  'services',
  'settings',
  'transactions',
  'user_sessions',
  'users'
]) as t;

drop function public._fix_permissive_rls_for_table(text);
