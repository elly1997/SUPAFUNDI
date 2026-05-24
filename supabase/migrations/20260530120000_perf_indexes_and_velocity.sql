-- Performance indexes + aggregated sales velocity for stock page

CREATE INDEX IF NOT EXISTS idx_product_prices_current
  ON public.product_prices (product_id, price_type)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_org_outlet
  ON public.stock (organization_id, outlet_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product
  ON public.sale_items (product_id);

CREATE INDEX IF NOT EXISTS idx_sales_outlet_status_date
  ON public.sales (outlet_id, status, sale_date DESC);

CREATE OR REPLACE FUNCTION public.get_product_sales_velocity(
  p_outlet_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (product_id uuid, qty numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    si.product_id,
    SUM(si.quantity)::numeric AS qty
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE s.outlet_id = p_outlet_id
    AND s.organization_id = public.get_auth_organization_id()
    AND s.status = 'completed'
    AND s.sale_date >= (now() - make_interval(days => GREATEST(p_days, 1)))
    AND si.product_id IS NOT NULL
  GROUP BY si.product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_sales_velocity(uuid, integer) TO authenticated;
