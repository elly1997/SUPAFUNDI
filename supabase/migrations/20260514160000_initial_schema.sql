-- HardwarePOS Cloud — initial schema + RLS (multi-tenant by organization_id)
-- Requires: pgcrypto (gen_random_uuid) — enabled by default on Supabase

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core / auth
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  tax_id text,
  currency text not null default 'TZS',
  country text not null default 'TZ',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  outlet_id uuid references public.outlets (id) on delete set null,
  full_name text,
  phone text,
  role text not null check (role in (
    'owner', 'manager', 'cashier', 'accountant', 'sales_rep', 'viewer'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute procedure public.set_updated_at();

create trigger outlets_set_updated_at
before update on public.outlets
for each row execute procedure public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- Tenant helper (must run after public.profiles exists; used by RLS below)
create or replace function public.get_auth_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

comment on function public.get_auth_organization_id() is
  'Returns the caller profile organization_id; SECURITY DEFINER avoids RLS recursion.';

grant execute on function public.get_auth_organization_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Product / inventory
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  credit_limit numeric(15, 2) not null default 0,
  credit_days integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  code text,
  barcode text,
  name text not null,
  description text,
  unit text not null default 'pcs',
  reorder_point numeric(15, 3) not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, barcode),
  unique (organization_id, code)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  price_type text not null check (price_type in ('retail', 'wholesale', 'trade', 'vip')),
  price numeric(15, 2) not null,
  min_qty numeric(15, 3) not null default 1,
  effective_from date not null default (current_date),
  effective_to date,
  created_at timestamptz not null default now()
);

create table public.stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity numeric(15, 3) not null default 0,
  cost_price numeric(15, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (outlet_id, product_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  movement_type text not null check (movement_type in (
    'sale', 'purchase', 'transfer_in', 'transfer_out',
    'adjustment_in', 'adjustment_out', 'return_in', 'return_out', 'opening'
  )),
  quantity numeric(15, 3) not null,
  unit_cost numeric(15, 2),
  reference_id uuid,
  reference_type text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  from_outlet_id uuid references public.outlets (id) on delete set null,
  to_outlet_id uuid references public.outlets (id) on delete set null,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'dispatched', 'received', 'cancelled'
  )),
  reference_no text,
  notes text,
  requested_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  received_by uuid references public.profiles (id) on delete set null,
  dispatched_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  requested_qty numeric(15, 3) not null,
  dispatched_qty numeric(15, 3),
  received_qty numeric(15, 3),
  unit_cost numeric(15, 2)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  reference_no text,
  status text not null default 'draft' check (status in (
    'draft', 'sent', 'partial', 'received', 'cancelled'
  )),
  order_date date not null default (current_date),
  expected_date date,
  subtotal numeric(15, 2) not null default 0,
  tax_amount numeric(15, 2) not null default 0,
  total_amount numeric(15, 2) not null default 0,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  ordered_qty numeric(15, 3) not null,
  received_qty numeric(15, 3) not null default 0,
  unit_cost numeric(15, 2) not null,
  total_cost numeric(15, 2)
);

create table public.grns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  reference_no text,
  received_date date not null default (current_date),
  invoice_no text,
  subtotal numeric(15, 2) not null default 0,
  tax_amount numeric(15, 2) not null default 0,
  total_amount numeric(15, 2) not null default 0,
  notes text,
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.grn_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.grns (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  quantity numeric(15, 3) not null,
  unit_cost numeric(15, 2) not null,
  total_cost numeric(15, 2)
);

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute procedure public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

create trigger stock_set_updated_at
before update on public.stock
for each row execute procedure public.set_updated_at();

create trigger stock_transfers_set_updated_at
before update on public.stock_transfers
for each row execute procedure public.set_updated_at();

create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sales / POS
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  customer_type text not null default 'retail' check (customer_type in (
    'retail', 'wholesale', 'trade', 'contractor', 'vip'
  )),
  credit_limit numeric(15, 2) not null default 0,
  credit_days integer not null default 0,
  outstanding_balance numeric(15, 2) not null default 0,
  tax_id text,
  loyalty_points integer not null default 0,
  price_type text not null default 'retail',
  sales_rep_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_price_type_check check (price_type in ('retail', 'wholesale', 'trade', 'vip'))
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  invoice_no text not null,
  sale_type text not null default 'retail' check (sale_type in ('retail', 'wholesale', 'quotation', 'proforma')),
  status text not null default 'completed' check (status in (
    'draft', 'completed', 'cancelled', 'returned', 'partial_return'
  )),
  customer_id uuid references public.customers (id) on delete set null,
  subtotal numeric(15, 2) not null,
  discount_amount numeric(15, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 18,
  tax_amount numeric(15, 2) not null default 0,
  total_amount numeric(15, 2) not null,
  amount_paid numeric(15, 2) not null default 0,
  change_given numeric(15, 2) not null default 0,
  balance_due numeric(15, 2) not null default 0,
  notes text,
  cashier_id uuid references public.profiles (id) on delete set null,
  sale_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_no)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity numeric(15, 3) not null,
  unit_price numeric(15, 2) not null,
  discount_pct numeric(5, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  total_price numeric(15, 2) not null
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  sale_id uuid references public.sales (id) on delete set null,
  payment_method text not null check (payment_method in (
    'cash', 'mpesa', 'card', 'bank_transfer', 'credit_account', 'cheque', 'loyalty_points'
  )),
  amount numeric(15, 2) not null,
  reference_no text,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'reversed')),
  payment_date timestamptz not null default now(),
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  original_sale_id uuid references public.sales (id) on delete set null,
  return_no text,
  reason text,
  total_amount numeric(15, 2) not null,
  refund_method text,
  processed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns (id) on delete cascade,
  sale_item_id uuid references public.sale_items (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  quantity numeric(15, 3) not null,
  unit_price numeric(15, 2) not null,
  total_price numeric(15, 2) not null
);

create trigger customers_set_updated_at
before update on public.customers
for each row execute procedure public.set_updated_at();

create trigger sales_set_updated_at
before update on public.sales
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Finance / credit
-- ---------------------------------------------------------------------------

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  entry_type text not null check (entry_type in (
    'invoice', 'payment', 'credit_note', 'adjustment', 'interest'
  )),
  reference_id uuid,
  reference_type text,
  debit numeric(15, 2) not null default 0,
  credit numeric(15, 2) not null default 0,
  balance numeric(15, 2) not null,
  description text,
  entry_date date not null default (current_date),
  due_date date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  category text,
  description text,
  amount numeric(15, 2) not null,
  payment_method text,
  reference_no text,
  expense_date date not null default (current_date),
  approved_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  cashier_id uuid references public.profiles (id) on delete set null,
  opening_balance numeric(15, 2) not null,
  closing_balance numeric(15, 2),
  expected_balance numeric(15, 2),
  variance numeric(15, 2),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  account_no text,
  bank_name text,
  currency text not null default 'TZS',
  current_balance numeric(15, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  transaction_type text check (transaction_type in ('deposit', 'withdrawal', 'transfer')),
  amount numeric(15, 2) not null,
  reference_no text,
  description text,
  is_reconciled boolean not null default false,
  transaction_date date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CRM / loyalty
-- ---------------------------------------------------------------------------

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  transaction_type text check (transaction_type in ('earn', 'redeem', 'expire', 'adjust')),
  points integer not null,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create table public.customer_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  activity_type text,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- System
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create trigger settings_set_updated_at
before update on public.settings
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

create or replace view public.v_stock_levels as
select
  s.outlet_id,
  o.name as outlet_name,
  s.product_id,
  p.code,
  p.name as product_name,
  p.barcode,
  p.unit,
  s.quantity,
  s.cost_price,
  (s.quantity * s.cost_price) as stock_value,
  p.reorder_point,
  case when s.quantity <= p.reorder_point then true else false end as needs_reorder
from public.stock s
join public.products p on p.id = s.product_id
join public.outlets o on o.id = s.outlet_id;

create or replace view public.v_customer_aging as
select
  cl.customer_id,
  c.name as customer_name,
  c.phone,
  sum(case when current_date - cl.due_date <= 30 then cl.debit - cl.credit else 0 end) as current_amount,
  sum(case when current_date - cl.due_date between 31 and 60 then cl.debit - cl.credit else 0 end) as days_31_60,
  sum(case when current_date - cl.due_date between 61 and 90 then cl.debit - cl.credit else 0 end) as days_61_90,
  sum(case when current_date - cl.due_date > 90 then cl.debit - cl.credit else 0 end) as over_90,
  sum(cl.debit - cl.credit) as total_outstanding
from public.credit_ledger cl
join public.customers c on c.id = cl.customer_id
where cl.balance > 0
group by cl.customer_id, c.name, c.phone;

-- ---------------------------------------------------------------------------
-- Indexes (hot paths)
-- ---------------------------------------------------------------------------

create index idx_outlets_org on public.outlets (organization_id);
create index idx_profiles_org on public.profiles (organization_id);
create index idx_products_org on public.products (organization_id);
create index idx_stock_outlet on public.stock (outlet_id);
create index idx_sales_org_outlet on public.sales (organization_id, outlet_id);
create index idx_sale_items_sale on public.sale_items (sale_id);
create index idx_payments_sale on public.payments (sale_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.outlets enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.stock enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.grns enable row level security;
alter table public.grn_items enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.customer_activities enable row level security;
alter table public.audit_log enable row level security;
alter table public.settings enable row level security;

-- Organizations: members read their tenant row
create policy organizations_select on public.organizations
for select to authenticated
using (id = public.get_auth_organization_id());

create policy organizations_update on public.organizations
for update to authenticated
using (id = public.get_auth_organization_id())
with check (id = public.get_auth_organization_id());

-- Outlets
create policy outlets_all on public.outlets
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

-- Profiles
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or (
    public.get_auth_organization_id() is not null
    and organization_id = public.get_auth_organization_id()
  )
);

create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy profiles_update on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Generic org-scoped CRUD
create policy categories_all on public.categories
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy suppliers_all on public.suppliers
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy products_all on public.products
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy stock_all on public.stock
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy stock_movements_all on public.stock_movements
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy stock_transfers_all on public.stock_transfers
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy purchase_orders_all on public.purchase_orders
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy grns_all on public.grns
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy customers_all on public.customers
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy sales_all on public.sales
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy payments_all on public.payments
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy sale_returns_all on public.sale_returns
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy credit_ledger_all on public.credit_ledger
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy expenses_all on public.expenses
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy cash_sessions_all on public.cash_sessions
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy bank_accounts_all on public.bank_accounts
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy bank_transactions_all on public.bank_transactions
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy loyalty_transactions_all on public.loyalty_transactions
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy customer_activities_all on public.customer_activities
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy audit_log_all on public.audit_log
for all to authenticated
using (
  organization_id is null
  or organization_id = public.get_auth_organization_id()
)
with check (
  organization_id is null
  or organization_id = public.get_auth_organization_id()
);

create policy settings_all on public.settings
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

-- Child rows without organization_id (inherit via parent FK)
create policy product_prices_all on public.product_prices
for all to authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_prices.product_id
      and p.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_prices.product_id
      and p.organization_id = public.get_auth_organization_id()
  )
);

create policy stock_transfer_items_all on public.stock_transfer_items
for all to authenticated
using (
  exists (
    select 1 from public.stock_transfers t
    where t.id = stock_transfer_items.transfer_id
      and t.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.stock_transfers t
    where t.id = stock_transfer_items.transfer_id
      and t.organization_id = public.get_auth_organization_id()
  )
);

create policy purchase_order_items_all on public.purchase_order_items
for all to authenticated
using (
  exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_items.po_id
      and po.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_items.po_id
      and po.organization_id = public.get_auth_organization_id()
  )
);

create policy grn_items_all on public.grn_items
for all to authenticated
using (
  exists (
    select 1 from public.grns g
    where g.id = grn_items.grn_id
      and g.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.grns g
    where g.id = grn_items.grn_id
      and g.organization_id = public.get_auth_organization_id()
  )
);

create policy sale_items_all on public.sale_items
for all to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.organization_id = public.get_auth_organization_id()
  )
);

create policy sale_return_items_all on public.sale_return_items
for all to authenticated
using (
  exists (
    select 1 from public.sale_returns r
    where r.id = sale_return_items.return_id
      and r.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.sale_returns r
    where r.id = sale_return_items.return_id
      and r.organization_id = public.get_auth_organization_id()
  )
);

-- Views: grant select; RLS applies to underlying tables
grant select on public.v_stock_levels to authenticated;
grant select on public.v_customer_aging to authenticated;
