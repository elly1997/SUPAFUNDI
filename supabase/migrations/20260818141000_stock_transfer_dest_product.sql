-- Each catalog is outlet-owned, so a transfer line must remember the
-- destination product (matched or cloned on receive).

alter table public.stock_transfer_items
  add column if not exists to_product_id uuid references public.products (id) on delete set null;

create index if not exists stock_transfer_items_to_product_idx
  on public.stock_transfer_items (to_product_id)
  where to_product_id is not null;
