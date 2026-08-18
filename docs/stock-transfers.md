# Stock transfers between outlets

Each branch has its **own catalog**. A transfer therefore moves quantity, not a shared product row.

## Rules

- Sales and invoices stay on the outlet that created them. A transfer never writes a sale.
- Source lines must come from the **from** outlet catalog.
- Dispatch deducts stock at the source (`transfer_out`) at that outlet’s cost.
- Receive adds stock at the destination (`transfer_in`) onto a **destination** product:
  1. Same SKU/code at the destination
  2. Else same barcode
  3. Else same name (case/space insensitive)
  4. Else copy the source item into the destination catalog (prices and units included; supplier is not copied)
- Destination selling prices stay as they are when an existing item is matched. Copied items start with the source prices.
- Cost on the destination stock row is a weighted average of old dest stock and the transferred qty.

## Workflow

1. Cashier/owner creates a transfer (stock list or Inventory → Transfers).
2. Owner/manager approves if the creator cannot self-approve.
3. Dispatch — stock leaves the source immediately.
4. Destination staff confirm receipt (Incoming panel on Stock / Receive). Until then, qty is in transit.

Cancel is allowed only while pending or approved (before dispatch).

## Ops notes (Main Store ↔ Kilimani)

- Prefer matching names when Kilimani SKUs use a `KLM-` prefix.
- After receive, switch to the destination outlet and confirm the item appears on Products, Stock, and POS.
- Run the SQL migrations `20260818140000_sales_invoices_outlet_assignment.sql` and `20260818141000_stock_transfer_dest_product.sql` in Supabase before relying on this in production.
