-- Additional system accounts + optional deposit tracking on sales

alter table public.sales
add column if not exists deposit_applied numeric(15, 2) not null default 0;

comment on column public.sales.deposit_applied is
  'Portion of amount_paid applied from customer deposit_balance at checkout';

-- Backfill COA rows for orgs created before these accounts existed
insert into public.chart_of_accounts (
  organization_id,
  code,
  name,
  account_type,
  account_subtype,
  normal_balance,
  is_system,
  is_active
)
select
  o.id,
  v.code,
  v.name,
  v.account_type,
  v.account_subtype,
  v.normal_balance,
  true,
  true
from public.organizations o
cross join (
  values
    ('2050', 'Customer Deposits', 'liability', 'deposits', 'credit'),
    ('6050', 'Cash Over / Short', 'expense', 'cash_variance', 'debit')
) as v(code, name, account_type, account_subtype, normal_balance)
where not exists (
  select 1
  from public.chart_of_accounts c
  where c.organization_id = o.id
    and c.code = v.code
);
