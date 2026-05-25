-- Phase 2 performance support for server-paged catalog, stock, and POS search.

create extension if not exists pg_trgm;

create index if not exists idx_products_org_active_category_name
  on public.products (organization_id, category_id, name)
  where is_active = true;

create index if not exists idx_products_org_active_name_trgm
  on public.products using gin (lower(name) gin_trgm_ops)
  where is_active = true;

create index if not exists idx_products_org_active_code_trgm
  on public.products using gin (lower(coalesce(code, '')) gin_trgm_ops)
  where is_active = true;

create index if not exists idx_products_org_active_barcode_trgm
  on public.products using gin (lower(coalesce(barcode, '')) gin_trgm_ops)
  where is_active = true;

create index if not exists idx_product_prices_current_type_product
  on public.product_prices (price_type, product_id)
  where effective_to is null;

create index if not exists idx_stock_org_outlet_product
  on public.stock (organization_id, outlet_id, product_id);

create index if not exists idx_categories_org_name
  on public.categories (organization_id, name);
