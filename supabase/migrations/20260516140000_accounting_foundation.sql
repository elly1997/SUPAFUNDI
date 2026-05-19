-- QuickBooks-style general ledger + accounts payable foundation
-- Complements operational tables (sales, stock, credit_ledger) with double-entry books.

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in (
    'asset', 'liability', 'equity', 'income', 'expense', 'cogs'
  )),
  account_subtype text,
  parent_id uuid references public.chart_of_accounts (id) on delete set null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index idx_coa_org_type on public.chart_of_accounts (organization_id, account_type);

-- ---------------------------------------------------------------------------
-- Fiscal periods (monthly close / lock)
-- ---------------------------------------------------------------------------

create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, period_start, period_end)
);

-- ---------------------------------------------------------------------------
-- Journal entries (GL)
-- ---------------------------------------------------------------------------

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete set null,
  entry_no text not null,
  entry_date date not null default (current_date),
  description text not null,
  source_type text not null check (source_type in (
    'sale', 'sale_return', 'payment', 'grn', 'expense',
    'supplier_bill', 'supplier_payment', 'stock_adjustment',
    'opening_balance', 'manual', 'transfer', 'payroll'
  )),
  source_id uuid,
  fiscal_period_id uuid references public.fiscal_periods (id) on delete set null,
  is_posted boolean not null default true,
  is_reversal boolean not null default false,
  reversed_entry_id uuid references public.journal_entries (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, entry_no)
);

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts (id) on delete restrict,
  debit numeric(15, 2) not null default 0 check (debit >= 0),
  credit numeric(15, 2) not null default 0 check (credit >= 0),
  memo text,
  constraint jel_debit_xor_credit check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0) or (debit = 0 and credit = 0)
  )
);

create index idx_journal_entries_org_date on public.journal_entries (organization_id, entry_date desc);
create index idx_journal_lines_entry on public.journal_entry_lines (journal_entry_id);
create index idx_journal_lines_account on public.journal_entry_lines (account_id);

-- Balanced entry guard (debits must equal credits per journal)
create or replace function public.validate_journal_entry_balance()
returns trigger
language plpgsql
as $$
declare
  total_debit numeric(15, 2);
  total_credit numeric(15, 2);
  entry_id uuid;
begin
  entry_id := coalesce(new.journal_entry_id, old.journal_entry_id);
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into total_debit, total_credit
  from public.journal_entry_lines
  where journal_entry_id = entry_id;
  if total_debit <> total_credit then
    raise exception 'Journal entry % is not balanced: debit % credit %',
      entry_id, total_debit, total_credit;
  end if;
  if total_debit = 0 and total_credit = 0 then
    raise exception 'Journal entry % has no amounts', entry_id;
  end if;
  return coalesce(new, old);
end;
$$;

-- Defer balance check to statement level via constraint trigger pattern:
-- Application layer validates before commit; DB trigger on journal_entries update optional.
comment on table public.journal_entry_lines is
  'Double-entry lines. Application must ensure sum(debit)=sum(credit) per journal_entry_id before posting.';

-- ---------------------------------------------------------------------------
-- Accounts payable (supplier bills — QuickBooks "Bills")
-- ---------------------------------------------------------------------------

create table public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  bill_no text not null,
  bill_date date not null default (current_date),
  due_date date,
  subtotal numeric(15, 2) not null default 0,
  tax_amount numeric(15, 2) not null default 0,
  total_amount numeric(15, 2) not null default 0,
  amount_paid numeric(15, 2) not null default 0,
  status text not null default 'open' check (status in (
    'draft', 'open', 'partial', 'paid', 'void'
  )),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, bill_no)
);

create table public.supplier_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.supplier_bills (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text,
  quantity numeric(15, 3) not null default 1,
  unit_cost numeric(15, 2) not null,
  total_cost numeric(15, 2) not null
);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  bill_id uuid references public.supplier_bills (id) on delete set null,
  payment_method text,
  amount numeric(15, 2) not null,
  reference_no text,
  payment_date date not null default (current_date),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger supplier_bills_set_updated_at
before update on public.supplier_bills
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tax codes (VAT)
-- ---------------------------------------------------------------------------

create table public.tax_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  rate numeric(5, 2) not null default 18,
  is_active boolean not null default true,
  applies_to text not null default 'sales' check (applies_to in ('sales', 'purchases', 'both')),
  unique (organization_id, code)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.chart_of_accounts enable row level security;
alter table public.fiscal_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_bill_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.tax_codes enable row level security;

create policy chart_of_accounts_all on public.chart_of_accounts
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy fiscal_periods_all on public.fiscal_periods
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy journal_entries_all on public.journal_entries
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy supplier_bills_all on public.supplier_bills
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy supplier_payments_all on public.supplier_payments
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy tax_codes_all on public.tax_codes
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy journal_entry_lines_all on public.journal_entry_lines
for all to authenticated
using (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_lines.journal_entry_id
      and je.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_lines.journal_entry_id
      and je.organization_id = public.get_auth_organization_id()
  )
);

create policy supplier_bill_items_all on public.supplier_bill_items
for all to authenticated
using (
  exists (
    select 1 from public.supplier_bills b
    where b.id = supplier_bill_items.bill_id
      and b.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.supplier_bills b
    where b.id = supplier_bill_items.bill_id
      and b.organization_id = public.get_auth_organization_id()
  )
);
