-- Daily closing, dashboard KPIs, and POS expense panel filter by org + outlet + date.
create index if not exists idx_expenses_org_outlet_date
  on public.expenses (organization_id, outlet_id, expense_date);
