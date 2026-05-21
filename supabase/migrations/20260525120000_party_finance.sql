-- Party finance: outlet on supplier payments, customer on AR payments
alter table public.supplier_payments
  add column if not exists outlet_id uuid references public.outlets (id) on delete set null;

alter table public.payments
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create index if not exists idx_supplier_payments_org_date
  on public.supplier_payments (organization_id, payment_date desc);

create index if not exists idx_supplier_payments_outlet_date
  on public.supplier_payments (outlet_id, payment_date desc)
  where outlet_id is not null;

create index if not exists idx_payments_customer
  on public.payments (customer_id, payment_date desc)
  where customer_id is not null;
