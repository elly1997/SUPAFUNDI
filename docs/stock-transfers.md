# Stock transfers between outlets

Each branch has its **own catalog** and **own document numbers**. A transfer moves quantity, not a sale.

## Simple workflow

1. **Send** from Stock or Inventory → Transfers (source catalog only).
   - Owner/manager: stock leaves immediately.
   - Cashier: request goes to **Inbox** for Approve & send.
2. Destination **confirms receipt**. Qty lands on that branch’s product:
   - same SKU, else barcode, else name
   - otherwise the item is copied into the destination catalog

No extra dispatch step. Approve & send is one tap from Inbox.

## Numbering

Transfer refs are per source outlet (`TRF-MAIN-2026-00001` vs `TRF-KILI-2026-00001`). Sales, invoices, and POs are also numbered per outlet.

## Inbox (owner / manager)

Pending transfer approvals, void-receipt requests, and unreconciled days for **every** outlet appear under Inbox.

## SQL to run in Supabase

- `20260818140000_sales_invoices_outlet_assignment.sql`
- `20260818141000_stock_transfer_dest_product.sql`
- `20260819120000_void_requests.sql`
