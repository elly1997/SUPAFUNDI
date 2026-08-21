-- Cashiers request void; owners/managers approve from Inbox.
-- One open request per sale.

create table public.void_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  invoice_no text not null,
  reason text,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected'
  )),
  requested_by uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists void_requests_open_sale_uidx
  on public.void_requests (sale_id)
  where status = 'pending';

create index if not exists void_requests_org_status_idx
  on public.void_requests (organization_id, status, created_at desc);

create index if not exists void_requests_outlet_idx
  on public.void_requests (organization_id, outlet_id, status);

alter table public.void_requests enable row level security;

create policy void_requests_all on public.void_requests
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

comment on table public.void_requests is
  'Pending void-receipt approvals for owners and managers (Inbox).';
