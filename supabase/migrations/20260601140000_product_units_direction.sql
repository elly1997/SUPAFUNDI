-- Explicit unit conversion direction for POS units.
-- false: one sell unit consumes factor_to_base base units (e.g. 1 box = 12 pcs)
-- true: one base unit contains factor_to_base sell units (e.g. 1 roll = 200 meters)

ALTER TABLE public.product_units
  ADD COLUMN IF NOT EXISTS units_per_base boolean NOT NULL DEFAULT false;
