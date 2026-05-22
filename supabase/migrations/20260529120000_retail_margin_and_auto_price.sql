-- Default retail markup on cost (%) and flag auto-generated selling prices
alter table public.product_prices
  add column if not exists auto_generated boolean not null default false;

comment on column public.product_prices.auto_generated is
  'True when retail price was set from cost × org margin (not manually entered).';

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
    (p_org_id, 'require_cash_session', 'false')
  on conflict (organization_id, key) do nothing;
end;
$$;
