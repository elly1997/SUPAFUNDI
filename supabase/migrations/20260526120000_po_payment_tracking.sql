-- Purchase order payment tracking (GRN receipts + AP settlement)

alter table public.purchase_orders
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'grn'));

alter table public.purchase_orders
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'partial'));

alter table public.purchase_orders
  add column if not exists payment_method text;

alter table public.purchase_orders
  add column if not exists paid_at date;

comment on column public.purchase_orders.source is
  'manual = draft PO workflow; grn = created from Receive goods (GRN).';

comment on column public.purchase_orders.payment_status is
  'unpaid = credit/AP outstanding; paid = settled; partial = part paid.';

create index if not exists purchase_orders_payment_status_idx
  on public.purchase_orders (organization_id, payment_status);
