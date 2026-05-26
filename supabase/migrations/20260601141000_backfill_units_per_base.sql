-- Backfill legacy POS units that represented smaller sell units inside a base unit.
-- Example: base roll = TZS 150,000 and alternate meter = TZS 1,000 with factor 150.

UPDATE public.product_units AS unit
SET units_per_base = true
FROM public.product_units AS base
WHERE unit.product_id = base.product_id
  AND base.is_base = true
  AND unit.is_base = false
  AND unit.units_per_base = false
  AND unit.factor_to_base > 1
  AND COALESCE(unit.retail_price, unit.wholesale_price, 0) > 0
  AND COALESCE(base.retail_price, base.wholesale_price, 0) > 0
  AND COALESCE(unit.retail_price, unit.wholesale_price, 0)
    < COALESCE(base.retail_price, base.wholesale_price, 0);
