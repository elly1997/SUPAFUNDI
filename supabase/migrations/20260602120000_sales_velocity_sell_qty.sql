-- Use sell_qty (checkout unit) for velocity when present; avoids roll/base mismatch.

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
    SUM(COALESCE(si.sell_qty, si.quantity))::numeric AS qty
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE s.outlet_id = p_outlet_id
    AND s.organization_id = public.get_auth_organization_id()
    AND s.status = 'completed'
    AND s.sale_date >= (now() - make_interval(days => GREATEST(p_days, 1)))
    AND si.product_id IS NOT NULL
  GROUP BY si.product_id;
$$;
