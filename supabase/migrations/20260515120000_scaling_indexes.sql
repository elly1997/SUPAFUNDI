-- Operational indexes for high write/read volume (additive; run after initial schema).
-- Partitioning: when sales or stock_movements exceed millions of rows per tenant,
-- introduce RANGE partitioning by month on sale_date / created_at and attach indexes per child.

-- Sales: reporting & POS history by org + time
create index if not exists idx_sales_org_sale_date
  on public.sales (organization_id, sale_date desc);

create index if not exists idx_sales_outlet_sale_date
  on public.sales (outlet_id, sale_date desc)
  where outlet_id is not null;

-- Stock movements: append-heavy audit trail
create index if not exists idx_stock_movements_org_created
  on public.stock_movements (organization_id, created_at desc);

-- Audit log: tenant-scoped scans + coarse time index for retention jobs
create index if not exists idx_audit_log_org_created
  on public.audit_log (organization_id, created_at desc);

create index if not exists idx_audit_log_created_brin
  on public.audit_log using brin (created_at);

-- Payments: daily reconciliation & outlet reporting
create index if not exists idx_payments_org_payment_date
  on public.payments (organization_id, payment_date desc);

-- Credit ledger: per-customer history
create index if not exists idx_credit_ledger_customer_entry
  on public.credit_ledger (customer_id, entry_date desc);

-- Products: hot path is active SKUs per org
create index if not exists idx_products_org_active
  on public.products (organization_id)
  where is_active = true;

-- Cash sessions: open shift lookup at POS
create index if not exists idx_cash_sessions_open
  on public.cash_sessions (organization_id, outlet_id)
  where status = 'open';

comment on table public.sales is
  'High write volume: above ~5–10M rows per org, plan monthly RANGE partitioning on sale_date and archive cold data.';

comment on table public.stock_movements is
  'Append-heavy: monitor seq scans vs index scans; consider BRIN(created_at) per org partition if btree size dominates.';
