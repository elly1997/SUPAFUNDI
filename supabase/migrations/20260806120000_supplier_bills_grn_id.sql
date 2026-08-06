-- Durable GRN ↔ payable bill link (replaces fragile notes ILIKE on UUID prefix).
alter table public.supplier_bills
  add column if not exists grn_id uuid references public.grns (id) on delete set null;

create unique index if not exists supplier_bills_org_grn_uidx
  on public.supplier_bills (organization_id, grn_id)
  where grn_id is not null;

comment on column public.supplier_bills.grn_id is
  'Source goods receipt when bill was created from a GRN on account.';
