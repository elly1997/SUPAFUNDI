# New Outlet Rollout

This rollout keeps the main outlet history intact while allowing a new outlet to start with a blank operational catalog, payroll, suppliers, payables, and banking setup.

## What the migration does

- Adds `outlet_id` ownership to `products`, `employees`, `employee_bonuses`, `payroll_runs`, `suppliers`, `supplier_bills`, and `bank_accounts`.
- Requires every sale/invoice to have an `outlet_id`. Receipt numbers are unique **per outlet**, not across the whole business.
- Backfills legacy rows to the earliest active outlet in each organization.
- Replaces org-wide product code/barcode uniqueness with outlet-scoped uniqueness.
- Replaces org-wide payroll month uniqueness with outlet-scoped uniqueness.

## Recommended rollout order

1. Run the SQL migration in Supabase.
2. Deploy the app changes in the same release window.
3. Confirm the main outlet still sees its products, staff, suppliers, payables, and collection accounts.
4. Switch to the new outlet and verify:
   - products page is blank
   - POS shows the outlet empty state
   - payroll has no staff
   - suppliers/payables are empty
   - banking accounts are empty
5. Import the new outlet in two steps:
   - `Create/update outlet catalog only`
   - `Load opening stock only`

## Backfill assumptions

- Existing shared operational masters are assigned to the earliest active outlet in the organization.
- Supplier bills are backfilled from GRN outlet, then PO outlet, then supplier outlet, then the default fallback outlet.
- This release is optimized for the "new outlet starts fresh" case. If an older secondary outlet already had active shared products or staff before this change, review and reassign those legacy rows before staff start transacting again.

## Manual verification checklist

- Create a product in outlet A and confirm it does not appear in outlet B.
- Reuse the same product code in a different outlet and confirm it is allowed.
- Preview an import in the second outlet and verify conflicts are only detected within that outlet.
- Create an employee in the second outlet and confirm payroll month refresh only includes that employee.
- Create a supplier bill in the second outlet and confirm it is hidden from the main outlet.
- Create a collection account in the second outlet and confirm banking lists only that outlet's account.
- Create a sale or invoice in outlet A and confirm it does not appear under outlet B.
- Confirm receipt numbers on A and B do not share one sequence.
- Transfer stock from A to B: send (or approve from Inbox); receive adds to B's catalog.
- As cashier, request void on a receipt and confirm it appears in owner Inbox only.
