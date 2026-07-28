-- Scope customers to an outlet so new branches start with an empty customer list.
-- Existing customers are assigned to each org's default (or first) outlet.

alter table public.customers
  add column if not exists outlet_id uuid references public.outlets (id) on delete set null;

comment on column public.customers.outlet_id is
  'Home outlet for this customer. Customers are not shared across branches.';

-- Backfill: default outlet first, else earliest outlet in the org.
update public.customers c
set outlet_id = (
  select o.id
  from public.outlets o
  where o.organization_id = c.organization_id
    and o.is_active = true
  order by o.is_default desc nulls last, o.created_at asc
  limit 1
)
where c.outlet_id is null;

-- Orgs without is_default column / all inactive: still try any outlet
update public.customers c
set outlet_id = (
  select o.id
  from public.outlets o
  where o.organization_id = c.organization_id
  order by o.created_at asc
  limit 1
)
where c.outlet_id is null;

create index if not exists idx_customers_org_outlet
  on public.customers (organization_id, outlet_id)
  where outlet_id is not null;
