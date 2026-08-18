-- New outlet separation:
-- - products become outlet-owned
-- - employees/payroll become outlet-owned
-- - suppliers, supplier bills, and bank accounts become outlet-owned

alter table public.products
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

alter table public.employees
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

alter table public.employee_bonuses
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

alter table public.payroll_runs
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

alter table public.suppliers
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

alter table public.supplier_bills
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

alter table public.bank_accounts
  add column if not exists outlet_id uuid references public.outlets (id) on delete cascade;

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

    update public.products
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;

    update public.employees e
    set outlet_id = coalesce(p.outlet_id, default_outlet_id)
    from public.profiles p
    where e.organization_id = org_row.id
      and e.outlet_id is null
      and p.id = e.profile_id;

    update public.employees
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;

    update public.employee_bonuses b
    set outlet_id = e.outlet_id
    from public.employees e
    where b.organization_id = org_row.id
      and b.outlet_id is null
      and e.id = b.employee_id;

    update public.employee_bonuses
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;

    update public.payroll_runs
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;

    update public.suppliers
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;

    update public.supplier_bills sb
    set outlet_id = coalesce(
      (select g.outlet_id from public.grns g where g.id = sb.grn_id),
      (select po.outlet_id from public.purchase_orders po where po.id = sb.po_id),
      (select s.outlet_id from public.suppliers s where s.id = sb.supplier_id),
      default_outlet_id
    )
    where sb.organization_id = org_row.id
      and sb.outlet_id is null;

    update public.supplier_bills
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;

    update public.bank_accounts
    set outlet_id = default_outlet_id
    where organization_id = org_row.id
      and outlet_id is null;
  end loop;
end $$;

alter table public.products
  drop constraint if exists products_organization_id_barcode_key;

alter table public.products
  drop constraint if exists products_organization_id_code_key;

drop index if exists public.idx_employees_profile;
alter table public.payroll_runs
  drop constraint if exists payroll_runs_organization_id_payroll_month_key;

create unique index if not exists products_org_outlet_code_uidx
  on public.products (organization_id, outlet_id, code)
  where code is not null;

create unique index if not exists products_org_outlet_barcode_uidx
  on public.products (organization_id, outlet_id, barcode)
  where barcode is not null;

create unique index if not exists employees_org_outlet_profile_uidx
  on public.employees (organization_id, outlet_id, profile_id)
  where profile_id is not null;

create unique index if not exists payroll_runs_org_outlet_month_uidx
  on public.payroll_runs (organization_id, outlet_id, payroll_month);

create index if not exists products_outlet_idx
  on public.products (organization_id, outlet_id, is_active, name);

create index if not exists employees_outlet_idx
  on public.employees (organization_id, outlet_id, is_active, full_name);

create index if not exists employee_bonuses_outlet_date_idx
  on public.employee_bonuses (organization_id, outlet_id, bonus_date);

create index if not exists payroll_runs_outlet_idx
  on public.payroll_runs (organization_id, outlet_id, payroll_month);

create index if not exists suppliers_outlet_idx
  on public.suppliers (organization_id, outlet_id, is_active, name);

create index if not exists supplier_bills_outlet_idx
  on public.supplier_bills (organization_id, outlet_id, status, bill_date);

create index if not exists bank_accounts_outlet_idx
  on public.bank_accounts (organization_id, outlet_id, is_active, name);

alter table public.products
  alter column outlet_id set not null;

alter table public.employees
  alter column outlet_id set not null;

alter table public.employee_bonuses
  alter column outlet_id set not null;

alter table public.payroll_runs
  alter column outlet_id set not null;

alter table public.suppliers
  alter column outlet_id set not null;

alter table public.supplier_bills
  alter column outlet_id set not null;

alter table public.bank_accounts
  alter column outlet_id set not null;
