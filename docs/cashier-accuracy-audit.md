# Cashier accuracy audit plan

Goal: every counter-facing screen should show **one clear number** that matches POS cash, stock, and daily closing. No conflicting cards vs statements.

## Priority 1 — Customers & deposits (in progress / this fix)

| Check | Pass criteria |
|-------|----------------|
| Deposit cash day | Cash/M-Pesa hits daily closing **once** |
| Later on-account sale | Uses prepaid; **no cash** that day |
| Cards vs statement | Available = `deposit_balance` = statement ending balance |
| List / POS | Shows both “owes us” and “we hold” (or net), never hides prepaid |
| Account checkout | Auto-applies `deposit_balance` to unpaid portion |

## Priority 2 — Suppliers & payables

| Check | Pass criteria |
|-------|----------------|
| Supplier balance | Matches open bills − payments |
| GRN / PO receive | Increases stock at **active** outlet only |
| Cash supplier payment | Appears in daily closing cash out that day |
| Payables list | Same totals as supplier statement |

## Priority 3 — Inventory & stock

| Check | Pass criteria |
|-------|----------------|
| Stock qty on screen | = `stock` for active outlet (POS sell qty uses same) |
| Transfer | Dispatch −source; receive +dest; in-transit clear |
| Import / stock take | Lands on **active** outlet, movement audit trail |
| Cost / retail value KPIs | Sum of outlet stock × prices |

## Priority 4 — Reports & daily closing

| Check | Pass criteria |
|-------|----------------|
| Day cash expected | Opening + cash sales + customer cash (AR + deposits) − expenses − bank − purchases − supplier cash |
| Deposit applied to invoice later | **Not** in that day’s cash in |
| Sales / profit reports | Outlet filter matches header branch |
| Credit outstanding report | Sum of customer `outstanding_balance` for outlet |

## Method (each section)

1. Pick one real outlet + one business date with known activity.
2. Trace POS → DB row → screen card → daily closing / report.
3. Log mismatches in a short table (screen, shown, expected, root cause).
4. Fix source of truth first; then UI; then repair scripts for old rows.

## Out of scope for this commit

Supplier / inventory / report deep fixes — scheduled after customers deposit truth is shipped and verified in production.
