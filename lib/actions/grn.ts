"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildGrnJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { createSupplierBillFromGrn } from "@/lib/actions/payables";
import { createReceivedPoFromGrn } from "@/lib/actions/purchase-orders";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeVat, roundMoney } from "@/lib/utils/calculations";

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

export async function listSuppliersForOrg(): Promise<
  { id: string; name: string }[]
> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
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
    const taxAmount = computeVat(inventoryValue, input.taxRate);
    const totalAmount = roundMoney(inventoryValue + taxAmount);

    const paymentMethod = resolvePurchasePayment(input);
    const receivedDate =
      input.businessDate ?? new Date().toISOString().slice(0, 10);

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
      taxRate: input.taxRate,
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

    revalidatePath("/inventory/stock");
    revalidatePath("/finance/payables");
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
