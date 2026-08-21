"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canRequestSaleVoid,
  isUserRole,
  type UserRole,
} from "@/lib/auth/roles";
import { voidSale } from "@/lib/actions/sales";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const requestInput = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export type VoidRequestRow = {
  id: string;
  saleId: string;
  invoiceNo: string;
  outletId: string;
  outletName: string;
  reason: string | null;
  requestedByName: string | null;
  createdAt: string;
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

export async function requestSaleVoid(
  raw: z.infer<typeof requestInput>
): Promise<{ ok: true; requestId: string } | { ok: false; message: string }> {
  try {
    const input = requestInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const role = await getProfileRole(supabase, ctx.userId);
    if (!canRequestSaleVoid(role)) {
      return {
        ok: false,
        message: "Ask an owner or manager to void this receipt, or use Inbox.",
      };
    }

    const { data: sale } = await supabase
      .from("sales")
      .select("id, invoice_no, status, outlet_id, organization_id")
      .eq("id", input.saleId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!sale) return { ok: false, message: "Sale not found." };
    if (sale.status !== "completed") {
      return { ok: false, message: "Only completed receipts can be voided." };
    }
    if (!sale.outlet_id) {
      return { ok: false, message: "Sale is missing outlet information." };
    }

    const { data: existing } = await supabase
      .from("void_requests")
      .select("id")
      .eq("sale_id", sale.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing?.id) {
      return { ok: false, message: "A void request for this receipt is already waiting." };
    }

    const { data: row, error } = await supabase
      .from("void_requests")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: sale.outlet_id,
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        reason: input.reason,
        status: "pending",
        requested_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !row) {
      return { ok: false, message: error?.message ?? "Could not send void request." };
    }

    revalidatePath("/inbox");
    revalidatePath("/sales");
    revalidatePath(`/sales/${sale.id}`);
    return { ok: true, requestId: row.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not send void request.",
    };
  }
}

export async function listPendingVoidRequests(): Promise<VoidRequestRow[]> {
  await requireManagerContext();
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("void_requests")
    .select(
      "id, sale_id, invoice_no, outlet_id, reason, requested_by, created_at"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const outletIds = Array.from(new Set(rows.map((r) => r.outlet_id)));
  const userIds = Array.from(
    new Set(rows.map((r) => r.requested_by).filter((id): id is string => !!id))
  );
  const [{ data: outlets }, { data: profiles }] = await Promise.all([
    outletIds.length
      ? supabase.from("outlets").select("id, name").in("id", outletIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({
          data: [] as { id: string; full_name: string | null }[],
        }),
  ]);
  const outletMap = new Map((outlets ?? []).map((o) => [o.id, o.name]));
  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Staff"])
  );

  return rows.map((r) => ({
    id: r.id,
    saleId: r.sale_id,
    invoiceNo: r.invoice_no,
    outletId: r.outlet_id,
    outletName: outletMap.get(r.outlet_id) ?? "Outlet",
    reason: r.reason,
    requestedByName: r.requested_by ? (nameMap.get(r.requested_by) ?? null) : null,
    createdAt: r.created_at,
  }));
}

export async function approveVoidRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const manager = await requireManagerContext();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data: row } = await supabase
      .from("void_requests")
      .select("id, sale_id, status")
      .eq("id", requestId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Request not found." };
    if (row.status !== "pending") {
      return { ok: false, message: "This request was already handled." };
    }

    const voided = await voidSale(row.sale_id);
    if (!voided.ok) return voided;

    await supabase
      .from("void_requests")
      .update({
        status: "approved",
        resolved_by: manager.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Approve failed",
    };
  }
}

export async function rejectVoidRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const manager = await requireManagerContext();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data: row } = await supabase
      .from("void_requests")
      .select("id, status")
      .eq("id", requestId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Request not found." };
    if (row.status !== "pending") {
      return { ok: false, message: "This request was already handled." };
    }
    const { error } = await supabase
      .from("void_requests")
      .update({
        status: "rejected",
        resolved_by: manager.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/inbox");
    revalidatePath("/sales");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Reject failed",
    };
  }
}
