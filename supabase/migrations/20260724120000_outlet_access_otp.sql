-- Outlet access OTPs: owner receives a code to share with invited users for outlet access.
-- user_outlet_access: outlets a user may work in (beyond or instead of profiles.outlet_id alone).

create table if not exists public.outlet_access_otps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  code_hash text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outlet_access_otps_user
  on public.outlet_access_otps (user_id, consumed_at);

create index if not exists idx_outlet_access_otps_org
  on public.outlet_access_otps (organization_id, created_at desc);

create table if not exists public.user_outlet_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, outlet_id)
);

create index if not exists idx_user_outlet_access_org
  on public.user_outlet_access (organization_id);

alter table public.outlet_access_otps enable row level security;
alter table public.user_outlet_access enable row level security;

-- Managers/owners manage OTPs and grants in their org; users can read their own grants.
create policy outlet_access_otps_select on public.outlet_access_otps
  for select to authenticated
  using (
    organization_id = public.get_auth_organization_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = outlet_access_otps.organization_id
          and p.role in ('owner', 'manager')
      )
    )
  );

create policy outlet_access_otps_insert on public.outlet_access_otps
  for insert to authenticated
  with check (
    organization_id = public.get_auth_organization_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = outlet_access_otps.organization_id
        and p.role in ('owner', 'manager')
    )
  );

create policy outlet_access_otps_update on public.outlet_access_otps
  for update to authenticated
  using (
    organization_id = public.get_auth_organization_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = outlet_access_otps.organization_id
          and p.role in ('owner', 'manager')
      )
    )
  );

create policy user_outlet_access_select on public.user_outlet_access
  for select to authenticated
  using (
    organization_id = public.get_auth_organization_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = user_outlet_access.organization_id
          and p.role in ('owner', 'manager')
      )
    )
  );

create policy user_outlet_access_insert on public.user_outlet_access
  for insert to authenticated
  with check (
    organization_id = public.get_auth_organization_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = user_outlet_access.organization_id
          and p.role in ('owner', 'manager')
      )
    )
  );

create policy user_outlet_access_delete on public.user_outlet_access
  for delete to authenticated
  using (
    organization_id = public.get_auth_organization_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = user_outlet_access.organization_id
        and p.role in ('owner', 'manager')
    )
  );

comment on table public.outlet_access_otps is
  'One-time codes sent to the owner/manager to share with a user for outlet access.';
comment on table public.user_outlet_access is
  'Outlets a user may switch into after redeeming an OTP (or owner/manager grant).';
