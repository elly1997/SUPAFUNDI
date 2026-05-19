-- Settings enhancements: outlet codes, profile email, manager user management RLS

-- Outlet short code for invoice/PO/transfer references (e.g. MAIN, DSM)
alter table public.outlets
add column if not exists code text;

create unique index if not exists idx_outlets_org_code
on public.outlets (organization_id, lower(code))
where code is not null and code <> '';

-- Denormalized email for user list (synced on invite / admin update)
alter table public.profiles
add column if not exists email text;

-- Managers/owners may update profiles in their organization (role, outlet, active)
create policy profiles_update_org_admin on public.profiles
for update to authenticated
using (
  organization_id = public.get_auth_organization_id()
  and organization_id is not null
  and exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid()
      and actor.organization_id = profiles.organization_id
      and actor.role in ('owner', 'manager')
      and actor.is_active = true
  )
)
with check (
  organization_id = public.get_auth_organization_id()
);

-- Seed default org settings keys (idempotent per org via unique key)
create or replace function public.seed_default_org_settings(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings (organization_id, key, value)
  values
    (p_org_id, 'default_vat_rate', '18'),
    (p_org_id, 'receipt_footer', 'Thank you for your business.'),
    (p_org_id, 'require_cash_session', 'false')
  on conflict (organization_id, key) do nothing;
end;
$$;

comment on column public.outlets.code is 'Short branch code for document numbers (e.g. MAIN)';
comment on column public.profiles.email is 'Cached from auth.users for admin user list';
