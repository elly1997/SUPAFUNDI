-- Staff registry, salary advances (via expenses.employee_id), bonuses, monthly payroll

-- GL accounts for payroll (existing orgs)
insert into public.chart_of_accounts (
  organization_id, code, name, account_type, account_subtype, normal_balance, is_system
)
select o.id, v.code, v.name, v.account_type, v.account_subtype, v.normal_balance, v.is_system
from public.organizations o
cross join (
  values
    ('1150', 'Employee Salary Advances', 'asset', 'employee_advances', 'debit', true),
    ('2060', 'Salaries Payable', 'liability', 'payroll', 'credit', true)
) as v(code, name, account_type, account_subtype, normal_balance, is_system)
where not exists (
  select 1 from public.chart_of_accounts c
  where c.organization_id = o.id and c.code = v.code
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  phone text,
  job_title text,
  gross_monthly_salary numeric(15, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_employees_org on public.employees (organization_id);
create unique index idx_employees_profile on public.employees (organization_id, profile_id)
  where profile_id is not null;

create trigger employees_set_updated_at
before update on public.employees
for each row execute procedure public.set_updated_at();

create table public.employee_bonuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  amount numeric(15, 2) not null check (amount > 0),
  bonus_date date not null default (current_date),
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_employee_bonuses_emp_date on public.employee_bonuses (employee_id, bonus_date);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payroll_month text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, payroll_month)
);

create trigger payroll_runs_set_updated_at
before update on public.payroll_runs
for each row execute procedure public.set_updated_at();

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  gross_salary numeric(15, 2) not null default 0,
  advances_total numeric(15, 2) not null default 0,
  bonuses_total numeric(15, 2) not null default 0,
  net_salary numeric(15, 2) not null default 0,
  payment_method text check (payment_method in ('cash', 'mpesa', 'bank_transfer')),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  reference_no text,
  paid_at timestamptz,
  unique (payroll_run_id, employee_id)
);

create index idx_payroll_lines_run on public.payroll_lines (payroll_run_id);

alter table public.expenses
  add column if not exists employee_id uuid references public.employees (id) on delete set null;

create index idx_expenses_employee on public.expenses (employee_id, expense_date)
  where employee_id is not null;

alter table public.employees enable row level security;
alter table public.employee_bonuses enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_lines enable row level security;

create policy employees_all on public.employees
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy employee_bonuses_all on public.employee_bonuses
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy payroll_runs_all on public.payroll_runs
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy payroll_lines_all on public.payroll_lines
for all to authenticated
using (
  exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_lines.payroll_run_id
      and r.organization_id = public.get_auth_organization_id()
  )
)
with check (
  exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_lines.payroll_run_id
      and r.organization_id = public.get_auth_organization_id()
  )
);
