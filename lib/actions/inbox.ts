"use server";

import { approveStockTransfer, listPendingTransfersOrgWide } from "@/lib/actions/transfers";
import {
  approveVoidRequest,
  listPendingVoidRequests,
  listRecentVoidedSales,
  rejectVoidRequest,
} from "@/lib/actions/void-requests";
import { listUnreconciledDays } from "@/lib/actions/daily-closing";
import { requireManagerContext } from "@/lib/server/require-manager";
import { formatTzs } from "@/lib/utils/currency";

export type InboxKind =
  | "transfer_approval"
  | "void_receipt"
  | "void_done"
  | "reconciliation";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  outletId: string;
  outletName: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  referenceId: string;
};

async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export async function listInboxItems(): Promise<{
  items: InboxItem[];
  openCount: number;
  warnings: string[];
}> {
  await requireManagerContext();

  const warnings: string[] = [];

  const [transfers, voidsResult, days, recentVoids] = await Promise.all([
    settled(listPendingTransfersOrgWide(), []),
    (async () => {
      try {
        return {
          rows: await listPendingVoidRequests(),
          error: null as string | null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Void requests unavailable";
        if (/void_requests|does not exist|schema cache/i.test(msg)) {
          return {
            rows: [],
            error:
              "Void requests table is missing. Run migration 20260819120000_void_requests.sql in Supabase SQL editor.",
          };
        }
        return { rows: [], error: msg };
      }
    })(),
    settled(listUnreconciledDays(null, 30), []),
    settled(listRecentVoidedSales(14, 40), []),
  ]);
  if (voidsResult.error) warnings.push(voidsResult.error);

  const items: InboxItem[] = [];

  for (const t of transfers) {
    items.push({
      id: `transfer:${t.id}`,
      kind: "transfer_approval",
      outletId: "",
      outletName: `${t.from_outlet_name ?? "Source"} → ${t.to_outlet_name ?? "Dest"}`,
      title: `Stock transfer ${t.reference_no ?? t.id.slice(0, 8)}`,
      body: `${t.item_count} item(s) waiting for approve & send.`,
      href: `/inventory/transfers/${t.id}`,
      createdAt: t.created_at,
      referenceId: t.id,
    });
  }

  for (const v of voidsResult.rows) {
    items.push({
      id: `void:${v.id}`,
      kind: "void_receipt",
      outletId: v.outletId,
      outletName: v.outletName,
      title: `Void request ${v.invoiceNo}`,
      body: [v.requestedByName ? `From ${v.requestedByName}` : null, v.reason]
        .filter(Boolean)
        .join(" · "),
      href: `/sales/${v.saleId}`,
      createdAt: v.createdAt,
      referenceId: v.id,
    });
  }

  const pendingSaleIds = new Set(voidsResult.rows.map((v) => v.saleId));
  for (const v of recentVoids) {
    if (pendingSaleIds.has(v.saleId)) continue;
    items.push({
      id: `voided:${v.saleId}`,
      kind: "void_done",
      outletId: v.outletId,
      outletName: v.outletName,
      title: `Voided ${v.invoiceNo}`,
      body: `Cancelled receipt · ${formatTzs(v.totalAmount)}`,
      href: `/sales/${v.saleId}`,
      createdAt: v.voidedAt,
      referenceId: v.saleId,
    });
  }

  for (const d of days) {
    items.push({
      id: `recon:${d.outletId}:${d.businessDate}`,
      kind: "reconciliation",
      outletId: d.outletId,
      outletName: d.outletName,
      title: `Reconcile ${d.businessDate}`,
      body:
        d.expectedCash > 0
          ? `Expected cash ${formatTzs(d.expectedCash)}`
          : "Day has sales or expenses — open closing to reconcile",
      href: `/daily-closing?date=${encodeURIComponent(d.businessDate)}&outlet=${encodeURIComponent(d.outletId)}`,
      createdAt: `${d.businessDate}T12:00:00.000Z`,
      referenceId: d.outletId,
    });
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openCount =
    transfers.length + voidsResult.rows.length + days.length;

  return {
    items,
    openCount,
    warnings,
  };
}

export async function getInboxOpenCount(): Promise<number> {
  try {
    const { openCount } = await listInboxItems();
    return openCount;
  } catch {
    return 0;
  }
}

export async function actOnInboxTransfer(
  transferId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireManagerContext();
  return approveStockTransfer(transferId);
}

export async function actOnInboxVoid(
  requestId: string,
  action: "approve" | "reject"
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireManagerContext();
  return action === "approve"
    ? approveVoidRequest(requestId)
    : rejectVoidRequest(requestId);
}
