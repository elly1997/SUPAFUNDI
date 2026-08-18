"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canApproveStockTransfers,
  canManageSettings,
  isUserRole,
  type UserRole,
} from "@/lib/auth/roles";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { formatTransferReference } from "@/lib/utils/po-number";

const transferLineInput = z.object({
  productId: z.string().uuid(),
  requestedQty: z.number().positive(),
});

const createTransferInput = z.object({
  fromOutletId: z.string().uuid(),
  toOutletId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  lines: z.array(transferLineInput).min(1),
});

export type TransferListRow = {
  id: string;
  reference_no: string | null;
  status: string;
  from_outlet_name: string | null;
  to_outlet_name: string | null;
  created_at: string;
  item_count: number;
};

export type TransferDetail = {
  id: string;
  reference_no: string | null;
  status: string;
  from_outlet_id: string | null;
  to_outlet_id: string | null;
  from_outlet_name: string | null;
  to_outlet_name: string | null;
  notes: string | null;
  created_at: string;
  dispatched_at: string | null;
  received_at: string | null;
  items: {
    id: string;
    product_id: string | null;
    product_name: string;
    product_code: string | null;
    requested_qty: number;
    dispatched_qty: number | null;
    received_qty: number | null;
    unit_cost: number | null;
  }[];
};

async function getProfileRole(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
): Promise<UserRole | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.role || !isUserRole(data.role)) return null;
  return data.role;
}

async function nextTransferReference(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("stock_transfers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", `${year}-01-01T00:00:00.000Z`);
  return formatTransferReference("ORG", year, (count ?? 0) + 1);
}

export async function listStockTransfers(): Promise<TransferListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, reference_no, status, from_outlet_id, to_outlet_id, created_at"
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const outletIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.from_outlet_id, r.to_outlet_id])
        .filter((id): id is string => !!id)
    )
  );
  const { data: outlets } = outletIds.length
    ? await supabase.from("outlets").select("id, name").in("id", outletIds)
    : { data: [] };
  const outletMap = new Map((outlets ?? []).map((o) => [o.id, o.name]));

  const transferIds = rows.map((r) => r.id);
  const { data: itemCounts } = transferIds.length
    ? await supabase
        .from("stock_transfer_items")
        .select("transfer_id")
        .in("transfer_id", transferIds)
    : { data: [] };
  const countMap = new Map<string, number>();
  for (const row of itemCounts ?? []) {
    countMap.set(row.transfer_id, (countMap.get(row.transfer_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    reference_no: r.reference_no,
    status: r.status,
    from_outlet_name: r.from_outlet_id
      ? (outletMap.get(r.from_outlet_id) ?? null)
      : null,
    to_outlet_name: r.to_outlet_id
      ? (outletMap.get(r.to_outlet_id) ?? null)
      : null,
    created_at: r.created_at,
    item_count: countMap.get(r.id) ?? 0,
  }));
}

export async function getStockTransferById(
  id: string
): Promise<TransferDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: tr, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, reference_no, status, from_outlet_id, to_outlet_id, notes, created_at, dispatched_at, received_at"
    )
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error || !tr) return null;

  const { data: items } = await supabase
    .from("stock_transfer_items")
    .select(
      "id, product_id, requested_qty, dispatched_qty, received_qty, unit_cost"
    )
    .eq("transfer_id", id);

  const productIds = Array.from(
    new Set(
      (items ?? [])
        .map((i) => i.product_id)
        .filter((pid): pid is string => !!pid)
    )
  );
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, code").in("id", productIds)
    : { data: [] };
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const outletIds = [tr.from_outlet_id, tr.to_outlet_id].filter(
    (x): x is string => !!x
  );
  const { data: outlets } = outletIds.length
    ? await supabase.from("outlets").select("id, name").in("id", outletIds)
    : { data: [] };
  const outletMap = new Map((outlets ?? []).map((o) => [o.id, o.name]));

  return {
    id: tr.id,
    reference_no: tr.reference_no,
    status: tr.status,
    from_outlet_id: tr.from_outlet_id,
    to_outlet_id: tr.to_outlet_id,
    from_outlet_name: tr.from_outlet_id
      ? (outletMap.get(tr.from_outlet_id) ?? null)
      : null,
    to_outlet_name: tr.to_outlet_id
      ? (outletMap.get(tr.to_outlet_id) ?? null)
      : null,
    notes: tr.notes,
    created_at: tr.created_at,
    dispatched_at: tr.dispatched_at,
    received_at: tr.received_at,
    items: (items ?? []).map((i) => {
      const p = i.product_id ? productMap.get(i.product_id) : null;
      return {
        id: i.id,
        product_id: i.product_id,
        product_name: p?.name ?? "—",
        product_code: p?.code ?? null,
        requested_qty: Number(i.requested_qty),
        dispatched_qty: i.dispatched_qty != null ? Number(i.dispatched_qty) : null,
        received_qty: i.received_qty != null ? Number(i.received_qty) : null,
        unit_cost: i.unit_cost != null ? Number(i.unit_cost) : null,
      };
    }),
  };
}

export async function createStockTransfer(
  raw: z.infer<typeof createTransferInput>
): Promise<{ ok: true; transferId: string } | { ok: false; message: string }> {
  try {
    const input = createTransferInput.parse(raw);
    if (input.fromOutletId === input.toOutletId) {
      return { ok: false, message: "Source and destination must differ." };
    }
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    for (const oid of [input.fromOutletId, input.toOutletId]) {
      const { data: o } = await supabase
        .from("outlets")
        .select("id")
        .eq("id", oid)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (!o) return { ok: false, message: "Invalid outlet." };
    }

    const referenceNo = await nextTransferReference(
      supabase,
      ctx.organizationId
    );

    const { data: tr, error: trErr } = await supabase
      .from("stock_transfers")
      .insert({
        organization_id: ctx.organizationId,
        from_outlet_id: input.fromOutletId,
        to_outlet_id: input.toOutletId,
        reference_no: referenceNo,
        status: "pending",
        notes: input.notes?.trim() || null,
        requested_by: ctx.userId,
      })
      .select("id")
      .single();
    if (trErr || !tr) {
      return { ok: false, message: trErr?.message ?? "Transfer create failed" };
    }

    const { error: itemsErr } = await supabase.from("stock_transfer_items").insert(
      input.lines.map((l) => ({
        transfer_id: tr.id,
        product_id: l.productId,
        requested_qty: l.requestedQty,
      }))
    );
    if (itemsErr) {
      await supabase.from("stock_transfers").delete().eq("id", tr.id);
      return { ok: false, message: itemsErr.message };
    }

    revalidatePath("/inventory/transfers");
    return { ok: true, transferId: tr.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create transfer failed",
    };
  }
}

export type IncomingTransferRow = TransferListRow & {
  from_outlet_id: string | null;
  to_outlet_id: string | null;
};

export async function listIncomingStockTransfers(
  outletId: string
): Promise<IncomingTransferRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, reference_no, status, from_outlet_id, to_outlet_id, created_at, dispatched_at"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("to_outlet_id", outletId)
    .eq("status", "dispatched")
    .order("dispatched_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const outletIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.from_outlet_id, r.to_outlet_id])
        .filter((id): id is string => !!id)
    )
  );
  const { data: outlets } = outletIds.length
    ? await supabase.from("outlets").select("id, name").in("id", outletIds)
    : { data: [] };
  const outletMap = new Map((outlets ?? []).map((o) => [o.id, o.name]));

  const transferIds = rows.map((r) => r.id);
  const { data: itemCounts } = transferIds.length
    ? await supabase
        .from("stock_transfer_items")
        .select("transfer_id")
        .in("transfer_id", transferIds)
    : { data: [] };
  const countMap = new Map<string, number>();
  for (const row of itemCounts ?? []) {
    countMap.set(row.transfer_id, (countMap.get(row.transfer_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    reference_no: r.reference_no,
    status: r.status,
    from_outlet_id: r.from_outlet_id,
    to_outlet_id: r.to_outlet_id,
    from_outlet_name: r.from_outlet_id
      ? (outletMap.get(r.from_outlet_id) ?? null)
      : null,
    to_outlet_name: r.to_outlet_id
      ? (outletMap.get(r.to_outlet_id) ?? null)
      : null,
    created_at: r.created_at,
    item_count: countMap.get(r.id) ?? 0,
  }));
}

/** Create, approve, and dispatch in one step (stock list quick transfer). */
export async function transferStockFromList(
  raw: z.infer<typeof createTransferInput>
): Promise<
  | {
      ok: true;
      transferId: string;
      referenceNo: string | null;
      pendingApproval?: boolean;
    }
  | { ok: false; message: string }
> {
  const created = await createStockTransfer(raw);
  if (!created.ok) return created;

  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const role = await getProfileRole(supabase, ctx.userId);

  if (!canApproveStockTransfers(role)) {
    revalidatePath("/inventory/transfers");
    revalidatePath("/inventory/stock");
    const detail = await getStockTransferById(created.transferId);
    return {
      ok: true,
      transferId: created.transferId,
      referenceNo: detail?.reference_no ?? null,
      pendingApproval: true,
    };
  }

  const { error: approveErr } = await supabase
    .from("stock_transfers")
    .update({ status: "approved", approved_by: ctx.userId })
    .eq("id", created.transferId);
  if (approveErr) {
    await supabase.from("stock_transfers").delete().eq("id", created.transferId);
    return { ok: false, message: approveErr.message };
  }

  const dispatched = await dispatchStockTransfer(created.transferId);
  if (!dispatched.ok) {
    await supabase
      .from("stock_transfers")
      .update({ status: "cancelled" })
      .eq("id", created.transferId);
    return dispatched;
  }

  const detail = await getStockTransferById(created.transferId);
  revalidatePath("/inventory/receive");
  revalidatePath("/inventory/stock");
  return {
    ok: true,
    transferId: created.transferId,
    referenceNo: detail?.reference_no ?? null,
    pendingApproval: false,
  };
}

export async function approveStockTransfer(
  transferId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const role = await getProfileRole(supabase, ctx.userId);
  if (!canApproveStockTransfers(role)) {
    return { ok: false, message: "Only owners and managers can approve transfers." };
  }
  const { data: tr } = await supabase
    .from("stock_transfers")
    .select("status")
    .eq("id", transferId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!tr) return { ok: false, message: "Transfer not found." };
  if (tr.status !== "pending") {
    return { ok: false, message: "Only pending transfers can be approved." };
  }
  const { error } = await supabase
    .from("stock_transfers")
    .update({ status: "approved", approved_by: ctx.userId })
    .eq("id", transferId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${transferId}`);
  return { ok: true };
}

export async function dispatchStockTransfer(
  transferId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const detail = await getStockTransferById(transferId);
  if (!detail) return { ok: false, message: "Transfer not found." };
  if (detail.status === "dispatched" || detail.status === "received") {
    return { ok: true };
  }
  if (detail.status !== "approved") {
    return { ok: false, message: "Transfer must be approved before dispatch." };
  }
  if (!detail.from_outlet_id) {
    return { ok: false, message: "Missing source outlet." };
  }

  try {
    for (const item of detail.items) {
      if (!item.product_id) continue;
      /** Idempotent: skip lines already deducted on a prior partial attempt. */
      if (Number(item.dispatched_qty ?? 0) > 0) continue;

      const qty = item.requested_qty;
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity, cost_price")
        .eq("outlet_id", detail.from_outlet_id)
        .eq("product_id", item.product_id)
        .maybeSingle();
      if (!stock || Number(stock.quantity) < qty) {
        return {
          ok: false,
          message: `Insufficient stock for ${item.product_name}.`,
        };
      }
      const newQty = roundMoney(Number(stock.quantity) - qty);
      const unitCost = Number(stock.cost_price);
      const { data: updated, error: updErr } = await supabase
        .from("stock")
        .update({ quantity: newQty })
        .eq("id", stock.id)
        .gte("quantity", qty)
        .select("id")
        .maybeSingle();
      if (updErr) throw new Error(updErr.message);
      if (!updated) {
        return {
          ok: false,
          message: `Stock changed for ${item.product_name}. Retry dispatch.`,
        };
      }

      await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: detail.from_outlet_id,
        product_id: item.product_id,
        movement_type: "transfer_out",
        quantity: qty,
        unit_cost: unitCost,
        reference_id: transferId,
        reference_type: "stock_transfer",
        created_by: ctx.userId,
      });

      await supabase
        .from("stock_transfer_items")
        .update({
          dispatched_qty: qty,
          unit_cost: unitCost,
        })
        .eq("id", item.id);
    }

    await supabase
      .from("stock_transfers")
      .update({
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", transferId);

    revalidatePath("/inventory/transfers");
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/receive");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Dispatch failed",
    };
  }
}

export async function receiveStockTransfer(
  transferId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const detail = await getStockTransferById(transferId);
  if (!detail) return { ok: false, message: "Transfer not found." };
  if (detail.status !== "dispatched") {
    return { ok: false, message: "Transfer must be dispatched before receiving." };
  }
  if (!detail.to_outlet_id || !detail.from_outlet_id) {
    return { ok: false, message: "Missing outlet on transfer." };
  }

  try {
    for (const item of detail.items) {
      if (!item.product_id) continue;
      const qty = item.dispatched_qty ?? item.requested_qty;
      const unitCost = item.unit_cost ?? 0;

      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity, cost_price")
        .eq("outlet_id", detail.to_outlet_id)
        .eq("product_id", item.product_id)
        .maybeSingle();

      const oldQty = Number(stock?.quantity ?? 0);
      const oldCost = Number(stock?.cost_price ?? 0);
      const newQty = roundMoney(oldQty + qty);
      const newCost =
        newQty > 0
          ? roundMoney((oldQty * oldCost + qty * unitCost) / newQty)
          : unitCost;

      if (stock?.id) {
        await supabase
          .from("stock")
          .update({ quantity: newQty, cost_price: newCost })
          .eq("id", stock.id);
      } else {
        await supabase.from("stock").insert({
          organization_id: ctx.organizationId,
          outlet_id: detail.to_outlet_id,
          product_id: item.product_id,
          quantity: qty,
          cost_price: unitCost,
        });
      }

      await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: detail.to_outlet_id,
        product_id: item.product_id,
        movement_type: "transfer_in",
        quantity: qty,
        unit_cost: unitCost,
        reference_id: transferId,
        reference_type: "stock_transfer",
        created_by: ctx.userId,
      });

      await supabase
        .from("stock_transfer_items")
        .update({ received_qty: qty })
        .eq("id", item.id);
    }

    await supabase
      .from("stock_transfers")
      .update({
        status: "received",
        received_at: new Date().toISOString(),
        received_by: ctx.userId,
      })
      .eq("id", transferId);

    revalidatePath("/inventory/transfers");
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/receive");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Receive failed",
    };
  }
}

export async function cancelStockTransfer(
  transferId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: tr } = await supabase
    .from("stock_transfers")
    .select("status")
    .eq("id", transferId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!tr) return { ok: false, message: "Transfer not found." };
  if (!["pending", "approved"].includes(tr.status)) {
    return {
      ok: false,
      message: "Only pending or approved transfers can be cancelled.",
    };
  }
  const { error } = await supabase
    .from("stock_transfers")
    .update({ status: "cancelled" })
    .eq("id", transferId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/transfers");
  return { ok: true };
}
