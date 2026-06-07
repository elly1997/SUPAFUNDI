-- Tie cash drawer sessions to business dates (align with daily_closings).

alter table public.cash_sessions
  add column if not exists business_date date;

update public.cash_sessions
set business_date = (opened_at at time zone 'UTC')::date
where business_date is null;

alter table public.cash_sessions
  alter column business_date set not null;

create index if not exists idx_cash_sessions_outlet_business_date
  on public.cash_sessions (organization_id, outlet_id, business_date desc);

comment on column public.cash_sessions.business_date is
  'Business day for this drawer session — matches header business date and daily_closings.business_date';
