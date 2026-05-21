-- Optional alternate units of measure (e.g. sell screws per pcs or per box).

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  unit_label text not null,
  factor_to_base numeric(15, 6) not null default 1 check (factor_to_base > 0),
  is_base boolean not null default false,
  retail_price numeric(15, 2),
  wholesale_price numeric(15, 2),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, unit_label)
);

create index if not exists idx_product_units_product
  on public.product_units (product_id);

alter table public.sale_items
  add column if not exists sell_unit text;

alter table public.sale_items
  add column if not exists sell_qty numeric(15, 3);

alter table public.product_units enable row level security;

create policy product_units_all on public.product_units
for all to authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_units.product_id
      and p.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_units.product_id
      and p.organization_id = public.get_auth_organization_id()
  )
);
