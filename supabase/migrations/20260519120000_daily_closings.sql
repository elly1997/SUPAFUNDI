-- Daily cash closing & reconciliation per outlet + business date
create table public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  business_date date not null,
  opening_balance numeric(15, 2) not null default 0,
  closing_balance numeric(15, 2),
  expected_cash numeric(15, 2),
  cash_sales numeric(15, 2) not null default 0,
  cash_expenses numeric(15, 2) not null default 0,
  mpesa_sales numeric(15, 2) not null default 0,
  bank_deposits numeric(15, 2) not null default 0,
  variance numeric(15, 2),
  status text not null default 'open' check (status in ('open', 'reconciled')),
  reconciled_at timestamptz,
  reconciled_by uuid references public.profiles (id) on delete set null,
  notes text,
  report_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, outlet_id, business_date)
);

create index idx_daily_closings_org_date
  on public.daily_closings (organization_id, business_date desc);

create index idx_daily_closings_outlet_date
  on public.daily_closings (outlet_id, business_date desc);

create index idx_daily_closings_unreconciled
  on public.daily_closings (organization_id, outlet_id, business_date)
  where status = 'open';

create trigger daily_closings_set_updated_at
before update on public.daily_closings
for each row execute procedure public.set_updated_at();

alter table public.daily_closings enable row level security;

create policy daily_closings_all on public.daily_closings
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

comment on table public.daily_closings is
  'End-of-day cash position; reports use reconciled rows only.';
