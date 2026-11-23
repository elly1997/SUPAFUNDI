"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildSupplierOpeningBalanceJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function apDb(supabase: SupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<SupabaseClient["from"]>;
  };
}

export type PayableBillRow = {
  id: string;
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  supplier_id: string | null;
  supplier_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
};

export async function listOpenPayables(): Promise<PayableBillRow[]> {
  const ctx = await requireOrgContext();
  if (!ctx.outletId) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await apDb(supabase)
    .from("supplier_bills")
    .select(
      "id, bill_no, bill_date, due_date, supplier_id, total_amount, amount_paid, status, suppliers(name)"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", ctx.outletId)
    .in("status", ["open", "partial", "draft"])
    .order("bill_date", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  type BillRow = {
    id: string;
    bill_no: string;
    bill_date: string;
    due_date: string | null;
    supplier_id: string | null;
    total_amount: number;
    amount_paid: number;
    status: string;
    suppliers: { name: string } | null;
  };

  return ((data ?? []) as BillRow[]).map((row) => {
    const sup = row.suppliers;
    const total = Number(row.total_amount);
    const paid = Number(row.amount_paid);
    return {
      id: row.id as string,
      bill_no: row.bill_no as string,
      bill_date: row.bill_date as string,
      due_date: row.due_date as string | null,
      supplier_id: row.supplier_id as string | null,
      supplier_name: sup?.name ?? "—",
      total_amount: total,
      amount_paid: paid,
      balance: roundMoney(total - paid),
      status: row.status as string,
    };
  });
}

async function nextBillNo(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string> {
  /** Use max numeric suffix — count+1 collides after deletes/gaps (e.g. 149 rows, BILL-00150 exists). */
  const { data } = await apDb(supabase)
    .from("supplier_bills")
    .select("bill_no")
    .eq("organization_id", organizationId)
    .like("bill_no", "BILL-%")
    .order("bill_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let n = 1;
  const raw = (data as { bill_no?: string } | null)?.bill_no;
  if (raw) {
    const m = /^BILL-(\d+)$/i.exec(raw);
    if (m) n = Number(m[1]) + 1;
  }
  return `BILL-${String(n).padStart(5, "0")}`;
}

/** Create AP bill when goods are received on supplier account. */
export async function createSupplierBillFromGrn(params: {
  grnId: string;
  supplierId: string;
  outletId?: string | null;
  billDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  referenceNo?: string | null;
  poId?: string | null;
  lines: { productId: string; quantity: number; unitCost: number }[];
}): Promise<{ ok: true; billId: string } | { ok: false; message: string }> {
  try {
    const ctx = await requireOrgContext();
    const billOutletId = params.outletId ?? ctx.outletId;
    if (!billOutletId) {
      return { ok: false, message: "Select a working outlet first." };
    }
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await apDb(supabase)
      .from("supplier_bills")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", billOutletId)
      .eq("grn_id", params.grnId)
      .maybeSingle();
    if (existing) return { ok: true, billId: existing.id };

    const due = new Date(params.billDate);
    due.setDate(due.getDate() + 30);
    const notes = params.referenceNo
      ? `From GRN ${params.referenceNo}`
      : `From GRN ${params.grnId.slice(0, 8)}`;

    let bill: { id: string } | null = null;
    let billErr: { message?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const billNo = await nextBillNo(supabase, ctx.organizationId);
      const inserted = await apDb(supabase)
        .from("supplier_bills")
        .insert({
          organization_id: ctx.organizationId,
          outlet_id: billOutletId,
          supplier_id: params.supplierId,
          po_id: params.poId ?? null,
          grn_id: params.grnId,
          bill_no: billNo,
          bill_date: params.billDate,
          due_date: due.toISOString().slice(0, 10),
          subtotal: params.subtotal,
          tax_amount: params.taxAmount,
          total_amount: params.totalAmount,
          amount_paid: 0,
          status: "open",
          notes,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      bill = inserted.data as { id: string } | null;
      billErr = inserted.error as { message?: string } | null;
      if (!billErr && bill) break;
      const msg = (billErr?.message ?? "").toLowerCase();
      /** Race: unique(grn_id) — re-read winner. */
      if (msg.includes("unique") && msg.includes("grn")) {
        const { data: raced } = await apDb(supabase)
          .from("supplier_bills")
          .select("id")
          .eq("organization_id", ctx.organizationId)
          .eq("outlet_id", billOutletId)
          .eq("grn_id", params.grnId)
          .maybeSingle();
        if (raced) return { ok: true, billId: raced.id };
      }
      /** Race / gap: unique(bill_no) — retry with a fresh max+1. */
      if (msg.includes("unique") && msg.includes("bill_no") && attempt < 2) {
        continue;
      }
      break;
    }
    if (billErr || !bill) {
      return { ok: false, message: billErr?.message ?? "Bill create failed" };
    }

    const items = params.lines.map((l) => ({
      bill_id: bill.id,
      product_id: l.productId,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      total_cost: roundMoney(l.quantity * l.unitCost),
    }));
    const { error: itemsErr } = await apDb(supabase)
      .from("supplier_bill_items")
      .insert(items);
    if (itemsErr) {
      await apDb(supabase).from("supplier_bills").delete().eq("id", bill.id);
      return { ok: false, message: itemsErr.message };
    }

    revalidatePath("/finance/payables");
    revalidatePath("/suppliers");
    revalidatePath("/suppliers");
    revalidatePath("/inventory/purchase-orders");
    if (params.poId) {
      revalidatePath(`/inventory/purchase-orders/${params.poId}`);
    }
    return { ok: true, billId: bill.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Bill create failed",
    };
  }
}

const manualBillInput = z.object({
  supplierId: z.string().uuid(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  totalAmount: z.number().positive(),
  notes: z.string().max(500).optional(),
});

export async function createManualSupplierBill(
  raw: z.infer<typeof manualBillInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const input = manualBillInput.parse(raw);
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return { ok: false, message: "Select a working outlet before creating bills." };
    }
    const supabase = await createServerSupabaseClient();
    const total = roundMoney(input.totalAmount);

    let data: { id: string } | null = null;
    let error: { message?: string } | null = null;
    let createdBillNo = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const billNo = await nextBillNo(supabase, ctx.organizationId);
      const inserted = await apDb(supabase)
        .from("supplier_bills")
        .insert({
          organization_id: ctx.organizationId,
          outlet_id: ctx.outletId,
          supplier_id: input.supplierId,
          bill_no: billNo,
          bill_date: input.billDate,
          due_date: input.dueDate ?? null,
          subtotal: total,
          tax_amount: 0,
          total_amount: total,
          amount_paid: 0,
          status: "open",
          notes: input.notes?.trim() || null,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      data = inserted.data as { id: string } | null;
      error = inserted.error as { message?: string } | null;
      if (!error && data) {
        createdBillNo = billNo;
        break;
      }
      const msg = (error?.message ?? "").toLowerCase();
      if (msg.includes("unique") && msg.includes("bill_no") && attempt < 2) {
        continue;
      }
      break;
    }
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Create failed" };
    }

    const journal = await postJournalEntry({
      description:
        input.notes?.trim() || `Manual supplier bill ${createdBillNo}`,
      sourceType: "supplier_bill",
      sourceId: data.id,
      entryDate: input.billDate,
      lines: buildSupplierOpeningBalanceJournalLines(total),
    });
    if (!journal.ok) {
      await apDb(supabase).from("supplier_bills").delete().eq("id", data.id);
      return { ok: false, message: journal.message };
    }

    revalidatePath("/finance/payables");
    revalidatePath("/suppliers");
    revalidatePath("/suppliers");
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create failed",
    };
  }
}
