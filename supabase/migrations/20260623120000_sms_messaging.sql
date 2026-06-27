-- SMS messaging (Africa's Talking) — credit reminders + marketing opt-in

create table public.customer_sms_preferences (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  marketing_opt_in boolean not null default false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  last_credit_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customer_sms_prefs_org on public.customer_sms_preferences (organization_id);

create trigger customer_sms_preferences_set_updated_at
before update on public.customer_sms_preferences
for each row execute procedure public.set_updated_at();

create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  phone text not null,
  message_body text not null,
  message_type text not null check (message_type in (
    'credit_reminder', 'marketing', 'manual'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'sent', 'delivered', 'failed'
  )),
  provider_id text,
  provider_status text,
  error_message text,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index idx_sms_messages_org_sent on public.sms_messages (organization_id, sent_at desc);
create index idx_sms_messages_customer on public.sms_messages (customer_id, sent_at desc);

alter table public.customer_sms_preferences enable row level security;
alter table public.sms_messages enable row level security;

create policy customer_sms_preferences_all on public.customer_sms_preferences
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

create policy sms_messages_all on public.sms_messages
for all to authenticated
using (organization_id = public.get_auth_organization_id())
with check (organization_id = public.get_auth_organization_id());

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
    (p_org_id, 'vat_enabled', 'false'),
    (p_org_id, 'default_retail_margin_pct', '40'),
    (p_org_id, 'receipt_footer', 'Thank you for your business.'),
    (p_org_id, 'require_cash_session', 'false'),
    (
      p_org_id,
      'sms_credit_template',
      'SUPAFUNDI: Habari {{name}}, deni lako ni {{balance}}. Tafadhali lipa haraka iwezekanavyo. Simu: {{shopPhone}}. Asante.'
    ),
    (
      p_org_id,
      'sms_marketing_template',
      'SUPAFUNDI: {{message}} Tembelea duka letu au piga {{shopPhone}}.'
    ),
    (p_org_id, 'sms_reminder_cooldown_days', '7'),
    (p_org_id, 'sms_marketing_enabled', 'false')
  on conflict (organization_id, key) do nothing;
end;
$$;

-- Backfill SMS settings for existing orgs
insert into public.settings (organization_id, key, value)
select o.id, v.key, v.value
from public.organizations o
cross join (
  values
    (
      'sms_credit_template',
      'SUPAFUNDI: Habari {{name}}, deni lako ni {{balance}}. Tafadhali lipa haraka iwezekanavyo. Simu: {{shopPhone}}. Asante.'
    ),
    (
      'sms_marketing_template',
      'SUPAFUNDI: {{message}} Tembelea duka letu au piga {{shopPhone}}.'
    ),
    ('sms_reminder_cooldown_days', '7'),
    ('sms_marketing_enabled', 'false')
) as v(key, value)
on conflict (organization_id, key) do nothing;
