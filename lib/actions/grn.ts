"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildGrnJournalLines,
  buildReversingJournalLines,
  type JournalLineInput,
} from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { withdrawFromCollectionAccount } from "@/lib/actions/banking";
import { createSupplierBillFromGrn } from "@/lib/actions/payables";
import { createReceivedPoFromGrn } from "@/lib/actions/purchase-orders";
import { validateCollectionAccount } from "@/lib/finance/collection-accounts";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { isoDateToTimestamptz, resolveBusinessDate } from "@/lib/utils/iso-date";
import {
  computeTaxAmount,
  effectiveTaxRate,
  getOrgVatConfig,
} from "@/lib/vat/org-vat";

const grnLineInput = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const purchasePaymentMethod = z.enum([
  "cash",
  "mpesa",
  "bank_transfer",
  "on_account",
]);

const receiveGoodsInput = z.object({
  outletId: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  referenceNo: z.string().max(100).optional(),
  invoiceNo: z.string().max(100).optional(),
  taxRate: z.number().min(0).max(100).default(18),
  /** Legacy: false = cash */
  onAccount: z.boolean().optional(),
  paymentMethod: purchasePaymentMethod.optional(),
  bankAccountId: z.string().uuid().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(grnLineInput).min(1),
});

function resolvePurchasePayment(
  input: z.infer<typeof receiveGoodsInput>
): z.infer<typeof purchasePaymentMethod> {
  if (input.paymentMethod) return input.paymentMethod;
  return input.onAccount === false ? "cash" : "on_account";
}

export type ReceiveGoodsInput = z.infer<typeof receiveGoodsInput>;

/** @deprecated Prefer fetchSupplierOptions() from client; kept for server callers. */
export async function listSuppliersForOrg(): Promise<
  { id: string; name: string }[]
> {
  const { listSuppliers } = await import("@/lib/actions/suppliers");
  const rows = await listSuppliers();
  return rows
    .filter((s) => s.is_active !== false)
    .map((s) => ({ id: s.id, name: s.name }));
}

export async function receiveGoods(
  raw: ReceiveGoodsInput
): Promise<
  { ok: true; grnId: string; poId: string } | { ok: false; message: string }
> {
  let grnId: string | null = null;
  const stockRollbacks: { stockId: string; qty: number; prevQty: number; prevCost: number }[] = [];

  try {
    const input = receiveGoodsInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const vatConfig = await getOrgVatConfig();
    const taxRate = effectiveTaxRate(vatConfig, input.taxRate);

    const { data: outlet } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!outlet) {
      return { ok: false, message: "Invalid outlet." };
    }

    const inventoryValue = roundMoney(
      input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    );
    const taxAmount = computeTaxAmount(inventoryValue, vatConfig, taxRate);
    const totalAmount = roundMoney(inventoryValue + taxAmount);

    const paymentMethod = resolvePurchasePayment(input);
    const accountCheck = validateCollectionAccount(
      paymentMethod,
      input.bankAccountId
    );
    if (!accountCheck.ok) return accountCheck;

    const receivedDate = resolveBusinessDate(input.businessDate);
    const movementAt = isoDateToTimestamptz(receivedDate);

    const { data: grn, error: grnErr } = await supabase
      .from("grns")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        supplier_id: input.supplierId ?? null,
        reference_no: input.referenceNo?.trim() || null,
        invoice_no: input.invoiceNo?.trim() || null,
        received_date: receivedDate,
        payment_method: paymentMethod,
        subtotal: inventoryValue,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: input.notes?.trim() || null,
        received_by: ctx.userId,
      })
      .select("id")
      .single();
    if (grnErr || !grn) {
      return { ok: false, message: grnErr?.message ?? "GRN insert failed" };
    }
    grnId = grn.id;

    const grnItems = input.lines.map((l) => ({
      grn_id: grn.id,
      product_id: l.productId,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      total_cost: roundMoney(l.quantity * l.unitCost),
    }));
    const { error: itemsErr } = await supabase.from("grn_items").insert(grnItems);
    if (itemsErr) {
      await supabase.from("grns").delete().eq("id", grn.id);
      return { ok: false, message: itemsErr.message };
    }

    for (const line of input.lines) {
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity, cost_price")
        .eq("outlet_id", input.outletId)
        .eq("product_id", line.productId)
        .maybeSingle();

      const oldQty = Number(stock?.quantity ?? 0);
      const oldCost = Number(stock?.cost_price ?? 0);
      const newQty = roundMoney(oldQty + line.quantity);
      const newCost =
        newQty > 0
          ? roundMoney(
              (oldQty * oldCost + line.quantity * line.unitCost) / newQty
            )
          : line.unitCost;

      if (stock?.id) {
        const { error: updErr } = await supabase
          .from("stock")
          .update({ quantity: newQty, cost_price: newCost })
          .eq("id", stock.id);
        if (updErr) throw new Error(updErr.message);
        stockRollbacks.push({
          stockId: stock.id,
          qty: line.quantity,
          prevQty: oldQty,
          prevCost: oldCost,
        });
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("stock")
          .insert({
            organization_id: ctx.organizationId,
            outlet_id: input.outletId,
            product_id: line.productId,
            quantity: line.quantity,
            cost_price: line.unitCost,
          })
          .select("id")
          .single();
        if (insErr || !inserted) throw new Error(insErr?.message ?? "Stock insert failed");
        stockRollbacks.push({
          stockId: inserted.id,
          qty: line.quantity,
          prevQty: 0,
          prevCost: 0,
        });
      }

      const { error: movErr } = await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        product_id: line.productId,
        movement_type: "purchase",
        quantity: line.quantity,
        unit_cost: line.unitCost,
        reference_id: grn.id,
        reference_type: "grn",
        created_by: ctx.userId,
        created_at: movementAt,
      });
      if (movErr) throw new Error(movErr.message);
    }

    const journal = await postJournalEntry({
      description: `Goods received GRN ${input.referenceNo ?? grn.id.slice(0, 8)}`,
      sourceType: "grn",
      sourceId: grn.id,
      outletId: input.outletId,
      entryDate: receivedDate,
      lines: buildGrnJournalLines({
        inventoryValue,
        taxAmount,
        paymentMethod,
      }),
    });
    if (!journal.ok) {
      throw new Error(journal.message);
    }

    const poResult = await createReceivedPoFromGrn({
      outletId: input.outletId,
      supplierId: input.supplierId ?? null,
      orderDate: receivedDate,
      paymentMethod,
      taxRate,
      grnId: grn.id,
      lines: input.lines,
      referenceHint: input.referenceNo,
    });
    if (!poResult.ok) {
      throw new Error(poResult.message);
    }

    if (paymentMethod === "on_account" && input.supplierId) {
      const bill = await createSupplierBillFromGrn({
        grnId: grn.id,
        supplierId: input.supplierId,
        billDate: receivedDate,
        subtotal: inventoryValue,
        taxAmount,
        totalAmount,
        referenceNo: input.referenceNo,
        poId: poResult.poId,
        lines: input.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
      if (!bill.ok) {
        throw new Error(bill.message);
      }
    }

    if (
      (paymentMethod === "mpesa" || paymentMethod === "bank_transfer") &&
      input.bankAccountId
    ) {
      const ref =
        input.referenceNo?.trim() ||
        input.invoiceNo?.trim() ||
        grn.id.slice(0, 8);
      const bank = await withdrawFromCollectionAccount(
        input.bankAccountId,
        totalAmount,
        `Purchase GRN ${ref}`,
        { referenceNo: ref, transactionDate: receivedDate }
      );
      if (!bank.ok) throw new Error(bank.message);
    }

    revalidatePath("/inventory/stock");
    revalidatePath("/finance/payables");
    revalidatePath("/suppliers");
    revalidatePath("/finance/banking");
    revalidatePath("/inventory/receive");
    revalidatePath("/inventory/products");
    revalidatePath("/inventory/purchase-orders");
    revalidatePath("/daily-closing");
    return { ok: true, grnId: grn.id, poId: poResult.poId };
  } catch (e) {
    if (grnId) {
      const supabase = await createServerSupabaseClient();
      for (const r of stockRollbacks) {
        if (r.prevQty === 0 && r.prevCost === 0) {
          await supabase.from("stock").delete().eq("id", r.stockId);
        } else {
          await supabase
            .from("stock")
            .update({ quantity: r.prevQty, cost_price: r.prevCost })
            .eq("id", r.stockId);
        }
      }
      await supabase.from("stock_movements").delete().eq("reference_id", grnId);
      await supabase.from("grn_items").delete().eq("grn_id", grnId);
      await supabase.from("grns").delete().eq("id", grnId);
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Receive goods failed",
    };
  }
}

function apDb(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };
}

async function loadGrnJournalLines(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  grnId: string
): Promise<JournalLineInput[]> {
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_id", grnId)
    .eq("source_type", "grn")
    .eq("is_reversal", false)
    .maybeSingle();
  if (!entry) return [];

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit")
    .eq("journal_entry_id", entry.id);
  if (!lines?.length) return [];

  const accountIds = Array.from(new Set(lines.map((l) => l.account_id)));
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code")
    .in("id", accountIds);
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  return lines
    .map((l) => {
      const code = codeById.get(l.account_id);
      if (!code) return null;
      return {
        accountCode: code,
        debit: Number(l.debit),
        credit: Number(l.credit),
      };
    })
    .filter((l): l is JournalLineInput => l !== null);
}

/** Void a goods receipt: reverse stock, GL, open supplier bill, and linked GRN-sourced PO. */
export async function voidGrn(
  grnId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: grn, error: grnErr } = await supabase
      .from("grns")
      .select(
        "id, outlet_id, supplier_id, po_id, payment_method, subtotal, tax_amount, total_amount, received_date"
      )
      .eq("id", grnId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (grnErr || !grn) {
      return { ok: false, message: "Receipt not found." };
    }
    if (!grn.outlet_id) {
      return { ok: false, message: "Receipt has no outlet." };
    }

    const { data: items } = await supabase
      .from("grn_items")
      .select("product_id, quantity, unit_cost")
      .eq("grn_id", grnId);
    if (!items?.length) {
      return { ok: false, message: "Receipt has no line items." };
    }

    for (const line of items) {
      if (!line.product_id) continue;
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity")
        .eq("outlet_id", grn.outlet_id)
        .eq("product_id", line.product_id)
        .maybeSingle();
      const available = Number(stock?.quantity ?? 0);
      if (available < Number(line.quantity)) {
        return {
          ok: false,
          message:
            "Cannot void: stock was sold or adjusted below received quantity. Adjust stock first.",
        };
      }
    }

    const originalLines = await loadGrnJournalLines(supabase, grnId);
    if (originalLines.length > 0) {
      const reverseLines = buildReversingJournalLines(originalLines);
      const journal = await postJournalEntry({
        description: `Void GRN ${grnId.slice(0, 8)}`,
        sourceType: "grn_void",
        sourceId: grnId,
        outletId: grn.outlet_id,
        entryDate: grn.received_date,
        lines: reverseLines,
      });
      if (!journal.ok) {
        return { ok: false, message: journal.message };
      }
    }

    const paymentMethod = (grn.payment_method ?? "on_account") as
      | "cash"
      | "mpesa"
      | "bank_transfer"
      | "on_account";

    if (paymentMethod === "on_account" && grn.supplier_id) {
      let bill: { id: string; amount_paid: number; status: string } | null =
        null;
      const { data: byGrn } = await apDb(supabase)
        .from("supplier_bills")
        .select("id, amount_paid, status")
        .eq("organization_id", ctx.organizationId)
        .eq("grn_id", grnId)
        .maybeSingle();
      bill = byGrn;
      if (!bill) {
        const grnTag = grnId.slice(0, 8);
        const { data: byNotes } = await apDb(supabase)
          .from("supplier_bills")
          .select("id, amount_paid, status")
          .eq("organization_id", ctx.organizationId)
          .ilike("notes", `%${grnTag}%`)
          .maybeSingle();
        bill = byNotes;
      }
      if (bill) {
        if (Number(bill.amount_paid) > 0) {
          return {
            ok: false,
            message:
              "Cannot void: supplier bill has payments. Reverse payments in Payables first.",
          };
        }
        await apDb(supabase).from("supplier_bills").delete().eq("id", bill.id);
      }
    }

    for (const line of items) {
      if (!line.product_id) continue;
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity, cost_price")
        .eq("outlet_id", grn.outlet_id)
        .eq("product_id", line.product_id)
        .maybeSingle();
      const qty = Number(line.quantity);
      const newQty = roundMoney(Number(stock?.quantity ?? 0) - qty);
      if (stock?.id) {
        const { error: updErr } = await supabase
          .from("stock")
          .update({
            quantity: newQty,
            ...(newQty <= 0 ? { cost_price: 0 } : {}),
          })
          .eq("id", stock.id);
        if (updErr) return { ok: false, message: updErr.message };
      }
    }

    if (grn.po_id) {
      const { data: po } = await supabase
        .from("purchase_orders")
        .select("id, source, status")
        .eq("id", grn.po_id)
        .maybeSingle();
      if (po?.source === "grn") {
        await supabase
          .from("purchase_orders")
          .update({ status: "cancelled" })
          .eq("id", po.id);
      } else if (po) {
        for (const line of items) {
          if (!line.product_id) continue;
          const { data: poi } = await supabase
            .from("purchase_order_items")
            .select("id, received_qty")
            .eq("po_id", po.id)
            .eq("product_id", line.product_id)
            .maybeSingle();
          if (poi) {
            const newReceived = roundMoney(
              Math.max(0, Number(poi.received_qty) - Number(line.quantity))
            );
            await supabase
              .from("purchase_order_items")
              .update({ received_qty: newReceived })
              .eq("id", poi.id);
          }
        }
        const { data: poItems } = await supabase
          .from("purchase_order_items")
          .select("ordered_qty, received_qty")
          .eq("po_id", po.id);
        const allReceived = (poItems ?? []).every(
          (i) => Number(i.received_qty) >= Number(i.ordered_qty)
        );
        const anyReceived = (poItems ?? []).some(
          (i) => Number(i.received_qty) > 0
        );
        await supabase
          .from("purchase_orders")
          .update({
            status: allReceived
              ? "received"
              : anyReceived
                ? "partial"
                : "sent",
          })
          .eq("id", po.id);
      }
    }

    await supabase.from("stock_movements").delete().eq("reference_id", grnId);
    await supabase.from("grn_items").delete().eq("grn_id", grnId);
    await supabase.from("grns").delete().eq("id", grnId);

    revalidatePath("/inventory/stock");
    revalidatePath("/finance/payables");
    revalidatePath("/suppliers");
    revalidatePath("/inventory/receive");
    revalidatePath("/inventory/purchase-orders");
    revalidatePath("/daily-closing");
    revalidatePath("/pos");
    revalidatePath("/suppliers");
    if (grn.supplier_id) {
      revalidatePath(`/suppliers/${grn.supplier_id}`);
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Void receipt failed",
    };
  }
}
