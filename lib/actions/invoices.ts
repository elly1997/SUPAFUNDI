"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SaleDocumentType } from "@/lib/constants/sale-documents";
import { invoicePrefixForType } from "@/lib/constants/sale-documents";
import { completeSale, type CompleteSaleInput } from "@/lib/actions/sales";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  computeLineTotal,
  computeVat,
  roundMoney,
} from "@/lib/utils/calculations";
import {
  formatInvoiceNo,
  outletInvoicePrefix,
} from "@/lib/utils/invoice-number";

const lineInput = z.object({
  productId: z.string().uuid().nullable().optional(),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).default(0),
});

const createDraftInput = z.object({
  outletId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  saleType: z.enum([
    "quotation",
    "proforma",
    "delivery_note",
    "retail",
    "wholesale",
  ]),
  taxRate: z.number().min(0).max(100).default(18),
  cartDiscountAmount: z.number().nonnegative().default(0),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineInput).min(1),
  validUntil: z.string().optional(),
});

export type SaleDocumentRow = {
  id: string;
  invoice_no: string;
  sale_type: string;
  status: string;
  sale_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  customer_name: string | null;
  due_date: string | null;
  is_overdue: boolean;
};

async function generateDocumentNo(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  outletId: string,
  saleType: SaleDocumentType
): Promise<string> {
  const { data: outlet } = await supabase
    .from("outlets")
    .select("name, code")
    .eq("id", outletId)
    .single();
  const outletPrefix =
    outlet?.code?.trim().toUpperCase() ||
    outletInvoicePrefix(outlet?.name ?? "OUT");
  const docPrefix = invoicePrefixForType(saleType);
  const prefix = docPrefix ? `${outletPrefix}-${docPrefix}` : outletPrefix;
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01T00:00:00.000Z`;

  const { count } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("sale_type", saleType)
    .gte("sale_date", yearStart);

  return formatInvoiceNo(prefix, year, (count ?? 0) + 1);
}

export async function listSaleDocuments(options?: {
  saleTypes?: SaleDocumentType[];
  status?: string[];
  balanceDueMin?: number;
  limit?: number;
}): Promise<SaleDocumentRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("sales")
    .select(
      "id, invoice_no, sale_type, status, sale_date, total_amount, amount_paid, balance_due, customer_id"
    )
    .eq("organization_id", ctx.organizationId)
    .order("sale_date", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.saleTypes?.length) {
    query = query.in("sale_type", options.saleTypes);
  }
  if (options?.status?.length) {
    query = query.in("status", options.status);
  }
  if (options?.balanceDueMin != null) {
    query = query.gte("balance_due", options.balanceDueMin);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const customerIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter((id): id is string => !!id))
  );
  const customerNames = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    for (const c of customers ?? []) {
      customerNames.set(c.id, c.name);
    }
  }

  const saleIds = rows.map((r) => r.id);
  const dueBySale = new Map<string, string>();
  if (saleIds.length > 0) {
    const { data: ledger } = await supabase
      .from("credit_ledger")
      .select("reference_id, due_date")
      .eq("organization_id", ctx.organizationId)
      .eq("entry_type", "invoice")
      .in("reference_id", saleIds);
    for (const e of ledger ?? []) {
      if (e.reference_id && e.due_date) {
        dueBySale.set(e.reference_id, e.due_date);
      }
    }
  }
  const today = new Date().toISOString().slice(0, 10);

  return rows.map((row) => {
    const dueDate = dueBySale.get(row.id) ?? null;
    return {
      id: row.id,
      invoice_no: row.invoice_no,
      sale_type: row.sale_type,
      status: row.status,
      sale_date: row.sale_date,
      total_amount: Number(row.total_amount),
      amount_paid: Number(row.amount_paid),
      balance_due: Number(row.balance_due),
      customer_name: row.customer_id
        ? (customerNames.get(row.customer_id) ?? null)
        : null,
      due_date: dueDate,
      is_overdue: !!dueDate && dueDate < today && Number(row.balance_due) > 0,
    };
  });
}

export async function createDraftSaleDocument(
  raw: z.infer<typeof createDraftInput>
): Promise<
  { ok: true; saleId: string; invoiceNo: string } | { ok: false; message: string }
> {
  try {
    const input = createDraftInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const lineTotals = input.lines.map((l) =>
      computeLineTotal(l.quantity, l.unitPrice, l.discountPct)
    );
    const subtotal = roundMoney(lineTotals.reduce((s, t) => s + t, 0));
    const discountAmount = roundMoney(
      Math.min(input.cartDiscountAmount, subtotal)
    );
    const taxableBase = roundMoney(subtotal - discountAmount);
    const taxAmount = computeVat(taxableBase, input.taxRate);
    const totalAmount = roundMoney(taxableBase + taxAmount);

    const invoiceNo = await generateDocumentNo(
      supabase,
      ctx.organizationId,
      input.outletId,
      input.saleType
    );

    const notes = [
      input.notes?.trim(),
      input.validUntil ? `Valid until: ${input.validUntil}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        invoice_no: invoiceNo,
        sale_type: input.saleType,
        status: "draft",
        customer_id: input.customerId ?? null,
        subtotal,
        discount_amount: discountAmount,
        tax_rate: input.taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_paid: 0,
        change_given: 0,
        balance_due: totalAmount,
        notes: notes || null,
        cashier_id: ctx.userId,
      })
      .select("id")
      .single();

    if (saleErr || !sale) {
      return { ok: false, message: saleErr?.message ?? "Could not create document." };
    }

    const { error: itemsErr } = await supabase.from("sale_items").insert(
      input.lines.map((l, i) => ({
        sale_id: sale.id,
        product_id: l.productId ?? null,
        product_name: l.productName,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        discount_pct: l.discountPct,
        tax_rate: input.taxRate,
        total_price: lineTotals[i],
      }))
    );

    if (itemsErr) {
      await supabase.from("sales").delete().eq("id", sale.id);
      return { ok: false, message: itemsErr.message };
    }

    revalidatePath("/invoices");
    revalidatePath("/sales");
    return { ok: true, saleId: sale.id, invoiceNo };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create failed",
    };
  }
}

export async function finalizeDraftSale(
  saleId: string,
  checkout: CompleteSaleInput
): Promise<Awaited<ReturnType<typeof completeSale>>> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: draft } = await supabase
    .from("sales")
    .select("id, status, sale_type")
    .eq("id", saleId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!draft) {
    return { ok: false, message: "Document not found." };
  }
  if (draft.status !== "draft") {
    return { ok: false, message: "Only draft documents can be finalized." };
  }

  await supabase.from("sale_items").delete().eq("sale_id", saleId);
  await supabase.from("sales").delete().eq("id", saleId);

  const saleType =
    draft.sale_type === "wholesale" || draft.sale_type === "retail"
      ? draft.sale_type
      : "retail";

  return completeSale({ ...checkout, saleType });
}

export async function cancelDraftSale(
  saleId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: draft } = await supabase
    .from("sales")
    .select("status")
    .eq("id", saleId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!draft) return { ok: false, message: "Document not found." };
  if (draft.status !== "draft") {
    return { ok: false, message: "Only drafts can be cancelled." };
  }

  await supabase.from("sale_items").delete().eq("sale_id", saleId);
  const { error } = await supabase.from("sales").delete().eq("id", saleId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/invoices");
  return { ok: true };
}
