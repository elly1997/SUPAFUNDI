-- Allow delivery note as a sale document type
alter table public.sales drop constraint if exists sales_sale_type_check;

alter table public.sales add constraint sales_sale_type_check check (
  sale_type in ('retail', 'wholesale', 'quotation', 'proforma', 'delivery_note')
);
