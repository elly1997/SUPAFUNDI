"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildGrnJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { createSupplierBillFromGrn } from "@/lib/actions/payables";
import { paySupplier } from "@/lib/actions/suppliers";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function apDb(supabase: SupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<SupabaseClient["from"]>;
  };
}
import { listStockLevels } from "@/lib/actions/stock";
import { roundMoney } from "@/lib/utils/calculations";
import {
  computeTaxAmount,
  effectiveTaxRate,
  getOrgVatConfig,
} from "@/lib/vat/org-vat";
import { isoDateToTimestamptz, resolveBusinessDate } from "@/lib/utils/iso-date";
import {
  formatPoReference,
  outletCodePrefix,
} from "@/lib/utils/po-number";

const poLineInput = z.object({
  productId: z.string().uuid(),
  orderedQty: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const createPoInput = z.object({
  outletId: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  expectedDate: z.string().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxRate: z.number().min(0).max(100).default(18),
  notes: z.string().max(2000).optional(),
  lines: z.array(poLineInput).min(1),
});

const receivePoInput = z.object({
  poId: z.string().uuid(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive(),
    })
  ).min(1),
  invoiceNo: z.string().max(100).optional(),
  onAccount: z.boolean().optional(),
  paymentMethod: z
    .enum(["cash", "mpesa", "bank_transfer", "on_account"])
    .optional(),
  taxRate: z.number().min(0).max(100).default(18),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type PurchaseOrderListRow = {
  id: string;
  reference_no: string | null;
  status: string;
  order_date: string;
  expected_date: string | null;
  total_amount: number;
  supplier_name: string | null;
  outlet_name: string | null;
  source: string;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
};

export type PurchaseOrderDetail = {
  id: string;
  reference_no: string | null;
  status: string;
  order_date: string;
  expected_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  outlet_id: string | null;
  outlet_name: string | null;
  source: string;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
  bill_id: string | null;
  bill_balance: number | null;
  items: {
    id: string;
    product_id: string | null;
    product_name: string;
    product_code: string | null;
    ordered_qty: number;
    received_qty: number;
    unit_cost: number;
    remaining_qty: number;
  }[];
};

async function nextPoReference(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  outletId: string
): Promise<string> {
  const { data: outlet } = await supabase
    .from("outlets")
    .select("name, code")
    .eq("id", outletId)
    .single();
  const prefix =
    outlet?.code?.trim().toUpperCase() ||
    outletCodePrefix(outlet?.name ?? "OUT");
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("order_date", `${year}-01-01`);
  return formatPoReference(prefix, year, (count ?? 0) + 1);
}

export async function listPurchaseOrders(): Promise<PurchaseOrderListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, reference_no, status, order_date, expected_date, total_amount, outlet_id, supplier_id, source, payment_status, payment_method, paid_at"
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const outletIds = Array.from(
    new Set(rows.map((r) => r.outlet_id).filter((id): id is string => !!id))
  );
  const supplierIds = Array.from(
    new Set(rows.map((r) => r.supplier_id).filter((id): id is string => !!id))
  );

  const [outlets, suppliers] = await Promise.all([
    outletIds.length
      ? supabase.from("outlets").select("id, name").in("id", outletIds)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
      : Promise.resolve({ data: [] }),
  ]);

  const outletMap = new Map((outlets.data ?? []).map((o) => [o.id, o.name]));
  const supplierMap = new Map(
    (suppliers.data ?? []).map((s) => [s.id, s.name])
  );

  return rows.map((r) => ({
    id: r.id,
    reference_no: r.reference_no,
    status: r.status,
    order_date: r.order_date,
    expected_date: r.expected_date,
    total_amount: Number(r.total_amount),
    outlet_name: r.outlet_id ? (outletMap.get(r.outlet_id) ?? null) : null,
    supplier_name: r.supplier_id
      ? (supplierMap.get(r.supplier_id) ?? null)
      : null,
    source: r.source ?? "manual",
    payment_status: r.payment_status ?? "unpaid",
    payment_method: r.payment_method ?? null,
    paid_at: r.paid_at ?? null,
  }));
}

export async function getPurchaseOrderById(
  id: string
): Promise<PurchaseOrderDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, reference_no, status, order_date, expected_date, subtotal, tax_amount, total_amount, notes, supplier_id, outlet_id, source, payment_status, payment_method, paid_at"
    )
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error || !po) return null;

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("id, product_id, ordered_qty, received_qty, unit_cost")
    .eq("po_id", id);

  const productIds = Array.from(
    new Set(
      (items ?? [])
        .map((i) => i.product_id)
        .filter((pid): pid is string => !!pid)
    )
  );
  const { data: products } = productIds.length
    ? await supabase
        .from("products")
        .select("id, name, code")
        .in("id", productIds)
    : { data: [] };
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  let supplierName: string | null = null;
  if (po.supplier_id) {
    const { data: s } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", po.supplier_id)
      .maybeSingle();
    supplierName = s?.name ?? null;
  }
  let outletName: string | null = null;
  if (po.outlet_id) {
    const { data: o } = await supabase
      .from("outlets")
      .select("name")
      .eq("id", po.outlet_id)
      .maybeSingle();
    outletName = o?.name ?? null;
  }

  let billId: string | null = null;
  let billBalance: number | null = null;
  const { data: bill } = await apDb(supabase)
    .from("supplier_bills")
    .select("id, total_amount, amount_paid, status")
    .eq("po_id", id)
    .maybeSingle();
  if (bill) {
    const b = bill as {
      id: string;
      total_amount: number;
      amount_paid: number;
      status: string;
    };
    billId = b.id;
    const bal = roundMoney(Number(b.total_amount) - Number(b.amount_paid));
    if (b.status !== "paid" && bal > 0) billBalance = bal;
  }

  return {
    id: po.id,
    reference_no: po.reference_no,
    status: po.status,
    order_date: po.order_date,
    expected_date: po.expected_date,
    subtotal: Number(po.subtotal),
    tax_amount: Number(po.tax_amount),
    total_amount: Number(po.total_amount),
    notes: po.notes,
    supplier_id: po.supplier_id,
    supplier_name: supplierName,
    outlet_id: po.outlet_id,
    outlet_name: outletName,
    source: po.source ?? "manual",
    payment_status: po.payment_status ?? "unpaid",
    payment_method: po.payment_method ?? null,
    paid_at: po.paid_at ?? null,
    bill_id: billId,
    bill_balance: billBalance,
    items: (items ?? []).map((i) => {
      const p = i.product_id ? productMap.get(i.product_id) : null;
      const ordered = Number(i.ordered_qty);
      const received = Number(i.received_qty);
      return {
        id: i.id,
        product_id: i.product_id,
        product_name: p?.name ?? "—",
        product_code: p?.code ?? null,
        ordered_qty: ordered,
        received_qty: received,
        unit_cost: Number(i.unit_cost),
        remaining_qty: roundMoney(Math.max(0, ordered - received)),
      };
    }),
  };
}

export async function createPurchaseOrder(
  raw: z.infer<typeof createPoInput>
): Promise<{ ok: true; poId: string } | { ok: false; message: string }> {
  try {
    const input = createPoInput.parse(raw);
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

    const subtotal = roundMoney(
      input.lines.reduce((s, l) => s + l.orderedQty * l.unitCost, 0)
    );
    const taxAmount = computeTaxAmount(subtotal, vatConfig, taxRate);
    const totalAmount = roundMoney(subtotal + taxAmount);
    const referenceNo = await nextPoReference(
      supabase,
      ctx.organizationId,
      input.outletId
    );

    const orderDate = resolveBusinessDate(input.businessDate);
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        supplier_id: input.supplierId ?? null,
        reference_no: referenceNo,
        status: "draft",
        order_date: orderDate,
        expected_date: input.expectedDate ?? null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: input.notes?.trim() || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (poErr || !po) {
      return { ok: false, message: poErr?.message ?? "PO create failed" };
    }

    const itemRows = input.lines.map((l) => ({
      po_id: po.id,
      product_id: l.productId,
      ordered_qty: l.orderedQty,
      received_qty: 0,
      unit_cost: l.unitCost,
      total_cost: roundMoney(l.orderedQty * l.unitCost),
    }));
    const { error: itemsErr } = await supabase
      .from("purchase_order_items")
      .insert(itemRows);
    if (itemsErr) {
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      return { ok: false, message: itemsErr.message };
    }

    revalidatePath("/inventory/purchase-orders");
    return { ok: true, poId: po.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create PO failed",
    };
  }
}

export async function sendPurchaseOrder(
  poId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!po) return { ok: false, message: "Purchase order not found." };
  if (po.status !== "draft") {
    return { ok: false, message: "Only draft orders can be sent." };
  }
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", poId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/purchase-orders");
  revalidatePath(`/inventory/purchase-orders/${poId}`);
  return { ok: true };
}

export async function cancelPurchaseOrder(
  poId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!po) return { ok: false, message: "Purchase order not found." };
  if (po.status === "received" || po.status === "cancelled") {
    return { ok: false, message: "Cannot cancel this order." };
  }
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", poId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/purchase-orders");
  return { ok: true };
}

export async function receiveFromPurchaseOrder(
  raw: z.infer<typeof receivePoInput>
): Promise<{ ok: true; grnId: string } | { ok: false; message: string }> {
  let grnId: string | null = null;
  const stockRollbacks: {
    stockId: string;
    prevQty: number;
    prevCost: number;
    isNew: boolean;
  }[] = [];

  try {
    const input = receivePoInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const vatConfig = await getOrgVatConfig();
    const taxRate = effectiveTaxRate(vatConfig, input.taxRate);

    const po = await getPurchaseOrderById(input.poId);
    if (!po) return { ok: false, message: "Purchase order not found." };
    if (!["sent", "partial"].includes(po.status)) {
      return {
        ok: false,
        message: "PO must be sent or partial to receive goods.",
      };
    }
    if (!po.outlet_id) {
      return { ok: false, message: "PO has no delivery outlet." };
    }

    const receiveLines: { productId: string; quantity: number; unitCost: number; poItemId: string }[] = [];
    for (const line of input.lines) {
      const item = po.items.find((i) => i.product_id === line.productId);
      if (!item) {
        return { ok: false, message: "Product not on this purchase order." };
      }
      if (line.quantity > item.remaining_qty) {
        return {
          ok: false,
          message: `Receive qty exceeds remaining for ${item.product_name}.`,
        };
      }
      receiveLines.push({
        productId: line.productId,
        quantity: line.quantity,
        unitCost: item.unit_cost,
        poItemId: item.id,
      });
    }

    const inventoryValue = roundMoney(
      receiveLines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    );
    const taxAmount = computeTaxAmount(inventoryValue, vatConfig, taxRate);
    const totalAmount = roundMoney(inventoryValue + taxAmount);
    const receivedDate = resolveBusinessDate(input.businessDate);
    const movementAt = isoDateToTimestamptz(receivedDate);

    const { data: grn, error: grnErr } = await supabase
      .from("grns")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: po.outlet_id,
        supplier_id: po.supplier_id,
        po_id: po.id,
        reference_no: po.reference_no,
        invoice_no: input.invoiceNo?.trim() || null,
        received_date: receivedDate,
        payment_method:
          input.paymentMethod ??
          (input.onAccount === false ? "cash" : "on_account"),
        subtotal: inventoryValue,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        received_by: ctx.userId,
      })
      .select("id")
      .single();
    if (grnErr || !grn) {
      return { ok: false, message: grnErr?.message ?? "GRN failed" };
    }
    grnId = grn.id;

    await supabase.from("grn_items").insert(
      receiveLines.map((l) => ({
        grn_id: grn.id,
        product_id: l.productId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
        total_cost: roundMoney(l.quantity * l.unitCost),
      }))
    );

    for (const line of receiveLines) {
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity, cost_price")
        .eq("outlet_id", po.outlet_id!)
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
        await supabase
          .from("stock")
          .update({ quantity: newQty, cost_price: newCost })
          .eq("id", stock.id);
        stockRollbacks.push({
          stockId: stock.id,
          prevQty: oldQty,
          prevCost: oldCost,
          isNew: false,
        });
      } else {
        const { data: ins } = await supabase
          .from("stock")
          .insert({
            organization_id: ctx.organizationId,
            outlet_id: po.outlet_id,
            product_id: line.productId,
            quantity: line.quantity,
            cost_price: line.unitCost,
          })
          .select("id")
          .single();
        if (!ins) throw new Error("Stock insert failed");
        stockRollbacks.push({
          stockId: ins.id,
          prevQty: 0,
          prevCost: 0,
          isNew: true,
        });
      }

      await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: po.outlet_id,
        product_id: line.productId,
        movement_type: "purchase",
        quantity: line.quantity,
        unit_cost: line.unitCost,
        reference_id: grn.id,
        reference_type: "grn",
        notes: `PO ${po.reference_no ?? po.id.slice(0, 8)}`,
        created_by: ctx.userId,
        created_at: movementAt,
      });

      const item = po.items.find((i) => i.id === line.poItemId)!;
      const newReceived = roundMoney(item.received_qty + line.quantity);
      await supabase
        .from("purchase_order_items")
        .update({ received_qty: newReceived })
        .eq("id", line.poItemId);
    }

    const journal = await postJournalEntry({
      description: `PO receipt ${po.reference_no ?? po.id.slice(0, 8)}`,
      sourceType: "grn",
      sourceId: grn.id,
      outletId: po.outlet_id,
      entryDate: receivedDate,
      lines: buildGrnJournalLines({
        inventoryValue,
        taxAmount,
        paymentMethod:
          input.paymentMethod ??
          (input.onAccount === false ? "cash" : "on_account"),
      }),
    });
    if (!journal.ok) throw new Error(journal.message);

    const paymentMethod =
      input.paymentMethod ??
      (input.onAccount === false ? "cash" : "on_account");
    const isCredit = paymentMethod === "on_account";

    const updated = await getPurchaseOrderById(po.id);
    const allReceived =
      updated?.items.every((i) => i.remaining_qty <= 0) ?? false;
    const anyReceived = updated?.items.some((i) => i.received_qty > 0) ?? false;
    await supabase
      .from("purchase_orders")
      .update({
        status: allReceived ? "received" : anyReceived ? "partial" : po.status,
        payment_status: isCredit ? "unpaid" : "paid",
        payment_method: paymentMethod,
        paid_at: isCredit ? null : receivedDate,
      })
      .eq("id", po.id);

    if (isCredit && po.supplier_id) {
      const bill = await createSupplierBillFromGrn({
        grnId: grn.id,
        supplierId: po.supplier_id,
        billDate: receivedDate,
        subtotal: inventoryValue,
        taxAmount,
        totalAmount,
        referenceNo: po.reference_no,
        poId: po.id,
        lines: receiveLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
      if (!bill.ok) throw new Error(bill.message);
    }

    revalidatePath("/inventory/purchase-orders");
    revalidatePath("/finance/payables");
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/receive");
    return { ok: true, grnId: grn.id };
  } catch (e) {
    if (grnId) {
      const supabase = await createServerSupabaseClient();
      for (const r of stockRollbacks) {
        if (r.isNew) {
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
      message: e instanceof Error ? e.message : "Receive from PO failed",
    };
  }
}

type GrnPoLine = { productId: string; quantity: number; unitCost: number };

/** Create a received PO linked to a GRN (direct receive goods flow). */
export async function createReceivedPoFromGrn(params: {
  outletId: string;
  supplierId: string | null;
  orderDate: string;
  paymentMethod: "cash" | "mpesa" | "bank_transfer" | "on_account";
  taxRate: number;
  grnId: string;
  lines: GrnPoLine[];
  referenceHint?: string | null;
}): Promise<{ ok: true; poId: string } | { ok: false; message: string }> {
  try {
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const vatConfig = await getOrgVatConfig();
    const taxRate = effectiveTaxRate(vatConfig, params.taxRate);
    const subtotal = roundMoney(
      params.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    );
    const taxAmount = computeTaxAmount(subtotal, vatConfig, taxRate);
    const totalAmount = roundMoney(subtotal + taxAmount);
    const isCredit = params.paymentMethod === "on_account";
    const referenceNo = await nextPoReference(
      supabase,
      ctx.organizationId,
      params.outletId
    );

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: params.outletId,
        supplier_id: params.supplierId,
        reference_no: referenceNo,
        status: "received",
        source: "grn",
        payment_status: isCredit ? "unpaid" : "paid",
        payment_method: params.paymentMethod,
        paid_at: isCredit ? null : params.orderDate,
        order_date: params.orderDate,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: `Goods receipt (GRN) · ${params.referenceHint ?? params.grnId.slice(0, 8)}`,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (poErr || !po) {
      return { ok: false, message: poErr?.message ?? "PO create failed" };
    }

    const itemRows = params.lines.map((l) => ({
      po_id: po.id,
      product_id: l.productId,
      ordered_qty: l.quantity,
      received_qty: l.quantity,
      unit_cost: l.unitCost,
      total_cost: roundMoney(l.quantity * l.unitCost),
    }));
    const { error: itemsErr } = await supabase
      .from("purchase_order_items")
      .insert(itemRows);
    if (itemsErr) {
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      return { ok: false, message: itemsErr.message };
    }

    await supabase
      .from("grns")
      .update({ po_id: po.id })
      .eq("id", params.grnId);

    revalidatePath("/inventory/purchase-orders");
    return { ok: true, poId: po.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "PO from GRN failed",
    };
  }
}

const payPoInput = z.object({
  poId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer", "cheque"]),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive().optional(),
  referenceNo: z.string().max(100).optional(),
  bankAccountId: z.string().uuid().optional(),
});

export async function payPurchaseOrder(
  raw: z.infer<typeof payPoInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = payPoInput.parse(raw);
    const po = await getPurchaseOrderById(input.poId);
    if (!po) return { ok: false, message: "Purchase order not found." };
    if (po.payment_status === "paid") {
      return { ok: false, message: "This purchase order is already paid." };
    }
    if (!po.supplier_id) {
      return { ok: false, message: "PO has no supplier for payment." };
    }

    const paymentDate =
      input.paymentDate ?? new Date().toISOString().slice(0, 10);
    const amount = roundMoney(input.amount ?? po.total_amount);

    let billId = po.bill_id;
    if (!billId && po.supplier_id) {
      const supabase = await createServerSupabaseClient();
      const { data: grn } = await supabase
        .from("grns")
        .select("id")
        .eq("po_id", input.poId)
        .maybeSingle();
      const bill = await createSupplierBillFromGrn({
        grnId: grn?.id ?? input.poId,
        supplierId: po.supplier_id,
        billDate: po.order_date,
        subtotal: po.subtotal,
        taxAmount: po.tax_amount,
        totalAmount: po.total_amount,
        referenceNo: po.reference_no,
        poId: po.id,
        lines: po.items
          .filter((i) => i.product_id)
          .map((i) => ({
            productId: i.product_id!,
            quantity: i.received_qty || i.ordered_qty,
            unitCost: i.unit_cost,
          })),
      });
      if (!bill.ok) return bill;
      billId = bill.billId;
    }

    const payResult = await paySupplier({
      supplierId: po.supplier_id,
      amount,
      paymentMethod: input.paymentMethod,
      paymentDate,
      billId: billId ?? undefined,
      referenceNo: input.referenceNo ?? po.reference_no ?? undefined,
      bankAccountId: input.bankAccountId,
    });
    if (!payResult.ok) return payResult;

    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("purchase_orders")
      .update({
        payment_status: "paid",
        payment_method: input.paymentMethod,
        paid_at: paymentDate,
      })
      .eq("id", input.poId)
      .eq("organization_id", ctx.organizationId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/inventory/purchase-orders");
    revalidatePath(`/inventory/purchase-orders/${input.poId}`);
    revalidatePath("/finance/payables");
    revalidatePath("/suppliers");
    if (po.supplier_id) {
      revalidatePath(`/suppliers/${po.supplier_id}`);
    }
    revalidatePath("/daily-closing");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "PO payment failed",
    };
  }
}

/** Draft PO from low/out-of-stock items at an outlet. */
export async function suggestPurchaseOrderFromStock(
  outletId: string,
  supplierId?: string | null
): Promise<{ ok: true; poId: string } | { ok: false; message: string }> {
  const levels = await listStockLevels(outletId);
  const lines = levels
    .filter(
      (r) =>
        r.reorder_point > 0 &&
        r.stock_status !== "ok" &&
        r.suggested_order_qty > 0 &&
        r.cost_price >= 0
    )
    .map((r) => ({
      productId: r.product_id,
      orderedQty: r.suggested_order_qty,
      unitCost: r.cost_price,
    }));
  if (lines.length === 0) {
    return {
      ok: false,
      message: "No low or out-of-stock items need replenishment.",
    };
  }
  const vatConfig = await getOrgVatConfig();
  return createPurchaseOrder({
    outletId,
    supplierId: supplierId ?? undefined,
    taxRate: effectiveTaxRate(vatConfig),
    notes: "Auto-suggested from stock levels",
    lines,
  });
}

export async function createSupplier(
  name: string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { createSupplierRecord } = await import("@/lib/actions/suppliers");
  return createSupplierRecord({
    name: name.trim(),
    creditLimit: 0,
    creditDays: 30,
    openingBalance: 0,
  });
}
