-- Extra indexes for fast sales history pagination and invoice search.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_sales_org_outlet_sale_date_desc
  ON public.sales (organization_id, outlet_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_no_trgm
  ON public.sales USING gin (invoice_no gin_trgm_ops);
