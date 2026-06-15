"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildSupplierReturnJournalLines,
  type PurchasePaymentMethod,
} from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { depositToCollectionAccount } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";
import { validateCollectionAccount } from "@/lib/finance/collection-accounts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { isoDateToTimestamptz, resolveBusinessDate } from "@/lib/utils/iso-date";

const lineInput = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const returnInput = z.object({
  outletId: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer", "on_account"]),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z.array(lineInput).min(1),
});

export async function createSupplierReturn(
  raw: z.infer<typeof returnInput>
): Promise<{ ok: true; returnId: string } | { ok: false; message: string }> {
  try {
    const input = returnInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const accountCheck = validateCollectionAccount(
      input.paymentMethod,
      input.bankAccountId
    );
    if (!accountCheck.ok) return accountCheck;

    const returnDate = resolveBusinessDate(input.businessDate);
    const movementAt = isoDateToTimestamptz(returnDate);
    const totalAmount = roundMoney(
      input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    );

    const { data: ret, error: retErr } = await supabase
      .from("supplier_returns")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        supplier_id: input.supplierId ?? null,
        reference_no: input.referenceNo?.trim() || null,
        return_date: returnDate,
        total_amount: totalAmount,
        payment_method: input.paymentMethod,
        notes: input.notes?.trim() || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (retErr || !ret) {
      return { ok: false, message: retErr?.message ?? "Return failed" };
    }

    await supabase.from("supplier_return_items").insert(
      input.lines.map((l) => ({
        return_id: ret.id,
        product_id: l.productId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
        total_cost: roundMoney(l.quantity * l.unitCost),
      }))
    );

    for (const line of input.lines) {
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity")
        .eq("outlet_id", input.outletId)
        .eq("product_id", line.productId)
        .maybeSingle();
      const available = Number(stock?.quantity ?? 0);
      if (available < line.quantity) {
        await supabase.from("supplier_returns").delete().eq("id", ret.id);
        return {
          ok: false,
          message: `Insufficient stock to return (${available} available).`,
        };
      }
      const newQty = roundMoney(available - line.quantity);
      await supabase
        .from("stock")
        .update({ quantity: newQty })
        .eq("id", stock!.id);

      await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        product_id: line.productId,
        movement_type: "return_out",
        quantity: line.quantity,
        unit_cost: line.unitCost,
        reference_id: ret.id,
        reference_type: "supplier_return",
        notes: input.notes?.trim() || null,
        created_by: ctx.userId,
        created_at: movementAt,
      });
    }

    const journal = await postJournalEntry({
      description: `Supplier return ${input.referenceNo ?? ret.id.slice(0, 8)}`,
      sourceType: "supplier_return",
      sourceId: ret.id,
      outletId: input.outletId,
      entryDate: returnDate,
      lines: buildSupplierReturnJournalLines({
        inventoryValue: totalAmount,
        paymentMethod: input.paymentMethod as PurchasePaymentMethod,
      }),
    });
    if (!journal.ok) {
      await supabase.from("supplier_returns").delete().eq("id", ret.id);
      return { ok: false, message: journal.message };
    }

    if (
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer") &&
      input.bankAccountId
    ) {
      const ref = input.referenceNo?.trim() || ret.id.slice(0, 8);
      const bank = await depositToCollectionAccount(
        input.bankAccountId,
        totalAmount,
        `Supplier return refund ${ref}`,
        { referenceNo: ref, transactionDate: returnDate }
      );
      if (!bank.ok) {
        await supabase.from("supplier_returns").delete().eq("id", ret.id);
        return bank;
      }
    }

    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/returns");
    revalidatePath("/suppliers");
    revalidatePath("/finance/banking");
    revalidatePath("/daily-closing");
    return { ok: true, returnId: ret.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Supplier return failed",
    };
  }
}
