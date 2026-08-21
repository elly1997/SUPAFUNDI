"use server";

import { approveStockTransfer, listPendingTransfersOrgWide } from "@/lib/actions/transfers";
import {
  approveVoidRequest,
  listPendingVoidRequests,
  rejectVoidRequest,
} from "@/lib/actions/void-requests";
import { listUnreconciledDays } from "@/lib/actions/daily-closing";
import { requireManagerContext } from "@/lib/server/require-manager";
import { formatTzs } from "@/lib/utils/currency";

export type InboxKind = "transfer_approval" | "void_receipt" | "reconciliation";

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

export async function listInboxItems(): Promise<{
  items: InboxItem[];
  openCount: number;
}> {
  await requireManagerContext();

  const [transfers, voids, days] = await Promise.all([
    listPendingTransfersOrgWide(),
    listPendingVoidRequests(),
    listUnreconciledDays(null, 20),
  ]);

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

  for (const v of voids) {
    items.push({
      id: `void:${v.id}`,
      kind: "void_receipt",
      outletId: v.outletId,
      outletName: v.outletName,
      title: `Void receipt ${v.invoiceNo}`,
      body: [v.requestedByName ? `From ${v.requestedByName}` : null, v.reason]
        .filter(Boolean)
        .join(" · "),
      href: `/sales/${v.saleId}`,
      createdAt: v.createdAt,
      referenceId: v.id,
    });
  }

  for (const d of days) {
    items.push({
      id: `recon:${d.outletId}:${d.businessDate}`,
      kind: "reconciliation",
      outletId: d.outletId,
      outletName: d.outletName,
      title: `Reconcile ${d.businessDate}`,
      body: `Expected cash ${formatTzs(d.expectedCash)}`,
      href: `/daily-closing?date=${encodeURIComponent(d.businessDate)}&outlet=${encodeURIComponent(d.outletId)}`,
      createdAt: `${d.businessDate}T12:00:00.000Z`,
      referenceId: d.outletId,
    });
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const actionable = items.filter((i) => i.kind !== "reconciliation").length;
  return {
    items,
    openCount: actionable + days.length,
  };
}

export async function getInboxOpenCount(): Promise<number> {
  const { openCount } = await listInboxItems();
  return openCount;
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
