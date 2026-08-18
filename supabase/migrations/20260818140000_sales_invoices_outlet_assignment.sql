-- Sales and invoices belong to an outlet. Numbering is unique per branch
-- so Main Store and Kilimani can issue the same-looking receipt independently.

do $$
declare
  org_row record;
  default_outlet_id uuid;
begin
  for org_row in
    select id from public.organizations
  loop
    select o.id
    into default_outlet_id
    from public.outlets o
    where o.organization_id = org_row.id
      and o.is_active = true
    order by o.created_at, o.name
    limit 1;

    if default_outlet_id is null then
      continue;
    end if;

    update public.sales
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;
  end loop;
end $$;

alter table public.sales
  alter column outlet_id set not null;

alter table public.sales
  drop constraint if exists sales_organization_id_invoice_no_key;

create unique index if not exists sales_org_outlet_invoice_uidx
  on public.sales (organization_id, outlet_id, invoice_no);

create index if not exists sales_outlet_status_date_idx
  on public.sales (organization_id, outlet_id, status, sale_date desc);
