-- Default outlet flag + org expense category list in settings

alter table public.outlets
add column if not exists is_default boolean not null default false;

create unique index if not exists idx_outlets_one_default_per_org
on public.outlets (organization_id)
where is_default = true;

-- Prefer MAIN / Main Store as default for existing orgs
update public.outlets o
set is_default = true
where not o.is_default
  and (
    lower(coalesce(o.code, '')) = 'main'
    or lower(trim(o.name)) in ('main store', 'main')
    or lower(o.name) like '%main%store%'
  )
  and not exists (
    select 1
    from public.outlets o2
    where o2.organization_id = o.organization_id
      and o2.is_default = true
      and o2.id <> o.id
  );

-- Orgs with no default yet: oldest outlet
update public.outlets o
set is_default = true
where not o.is_default
  and o.id = (
    select o3.id
    from public.outlets o3
    where o3.organization_id = o.organization_id
    order by o3.created_at asc
    limit 1
  )
  and not exists (
    select 1
    from public.outlets o2
    where o2.organization_id = o.organization_id
      and o2.is_default = true
  );

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
    (p_org_id, 'require_cash_session', 'false'),
    (
      p_org_id,
      'expense_categories',
      '[{"id":"rent","label":"Rent"},{"id":"utilities","label":"Utilities"},{"id":"wages","label":"Wages"},{"id":"bank","label":"Bank"},{"id":"stock","label":"Stock"},{"id":"misc","label":"Misc"}]'
    )
  on conflict (organization_id, key) do nothing;
end;
$$;

comment on column public.outlets.is_default is 'Primary branch used when no outlet is selected (one per org)';
