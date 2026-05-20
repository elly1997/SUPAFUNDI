-- Procurement payment tracking, customer deposits, supplier returns

alter table public.grns
add column if not exists payment_method text not null default 'on_account';

alter table public.grns
add constraint grns_payment_method_check check (
  payment_method in ('cash', 'mpesa', 'bank_transfer', 'on_account')
);

comment on column public.grns.payment_method is
  'How the purchase was paid: cash/mpesa/bank reduce respective accounts; on_account increases AP';

alter table public.customers
add column if not exists deposit_balance numeric(15, 2) not null default 0;

comment on column public.customers.deposit_balance is
  'Prepaid balance applied to future invoices before cash/credit';

create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  grn_id uuid references public.grns (id) on delete set null,
  reference_no text,
  return_date date not null default (current_date),
  total_amount numeric(15, 2) not null default 0,
  payment_method text not null default 'on_account' check (
    payment_method in ('cash', 'mpesa', 'bank_transfer', 'on_account')
  ),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.supplier_returns (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(15, 3) not null,
  unit_cost numeric(15, 2) not null,
  total_cost numeric(15, 2) not null
);

create index if not exists idx_supplier_returns_org on public.supplier_returns (organization_id);
create index if not exists idx_supplier_returns_outlet on public.supplier_returns (outlet_id);

alter table public.supplier_returns enable row level security;
alter table public.supplier_return_items enable row level security;

create policy supplier_returns_all on public.supplier_returns
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy supplier_return_items_all on public.supplier_return_items
for all to authenticated
using (
  exists (
    select 1 from public.supplier_returns r
    where r.id = supplier_return_items.return_id
      and r.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.supplier_returns r
    where r.id = supplier_return_items.return_id
      and r.organization_id = public.get_auth_organization_id()
  )
);

alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;

alter table public.journal_entries add constraint journal_entries_source_type_check check (
  source_type in (
    'sale', 'sale_return', 'payment', 'grn', 'expense',
    'supplier_bill', 'supplier_payment', 'supplier_return',
    'stock_adjustment', 'opening_balance', 'manual', 'transfer', 'payroll'
  )
);
