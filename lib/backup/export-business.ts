import "server-only";

import { listCustomers } from "@/lib/actions/customers";
import { listSuppliers } from "@/lib/actions/suppliers";
import { csvDocument } from "@/lib/backup/csv";
import type { BusinessExportType } from "@/lib/backup/business-export-types";
import { BUSINESS_EXPORT_TYPES } from "@/lib/backup/business-export-types";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchByInChunks } from "@/lib/supabase/query-chunks";
import { businessDateFromTimestamptz } from "@/lib/utils/iso-date";

export type { BusinessExportType } from "@/lib/backup/business-export-types";

export type BusinessExportParams = {
  type: BusinessExportType;
  fromDate?: string;
  toDate?: string;
  outletId?: string | null;
};

function periodBounds(fromDate?: string, toDate?: string) {
  return {
    from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
    to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
  };
}

function exportFilename(
  type: BusinessExportType,
  fromDate?: string,
  toDate?: string
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  if (fromDate && toDate) {
    return `${type}-${fromDate}_to_${toDate}.csv`;
  }
  return `${type}-${stamp}.csv`;
}

export async function buildBusinessExportCsv(
  params: BusinessExportParams
): Promise<{ csv: string; filename: string }> {
  const { type, fromDate, toDate, outletId } = params;
  const meta = BUSINESS_EXPORT_TYPES.find((t) => t.id === type);
  if (!meta) {
    throw new Error("Unknown export type.");
  }
  if (meta.needsDateRange && (!fromDate || !toDate)) {
    throw new Error("fromDate and toDate are required for this export.");
  }

  let csv: string;
  switch (type) {
    case "customers":
      csv = await exportCustomersCsv();
      break;
    case "suppliers":
      csv = await exportSuppliersCsv();
      break;
    case "sales":
      csv = await exportSalesCsv(fromDate!, toDate!, outletId);
      break;
    case "sale_items":
      csv = await exportSaleItemsCsv(fromDate!, toDate!, outletId);
      break;
    case "payments":
      csv = await exportPaymentsCsv(fromDate!, toDate!, outletId);
      break;
    case "expenses":
      csv = await exportExpensesCsv(fromDate!, toDate!, outletId);
      break;
    case "journal_lines":
      csv = await exportJournalLinesCsv(fromDate!, toDate!);
      break;
    default:
      throw new Error("Unsupported export type.");
  }

  return { csv, filename: exportFilename(type, fromDate, toDate) };
}

async function exportCustomersCsv(): Promise<string> {
  const rows = await listCustomers();
  return csvDocument(
    [
      "id",
      "name",
      "phone",
      "customer_type",
      "credit_limit",
      "credit_days",
      "outstanding_balance",
      "deposit_balance",
      "is_active",
    ],
    rows.map((c) => [
      c.id,
      c.name,
      c.phone,
      c.customer_type,
      c.credit_limit,
      c.credit_days,
      c.outstanding_balance,
      c.deposit_balance,
      c.is_active,
    ])
  );
}

async function exportSuppliersCsv(): Promise<string> {
  const rows = await listSuppliers();
  return csvDocument(
    [
      "id",
      "name",
      "phone",
      "contact_person",
      "credit_limit",
      "payables_balance",
      "is_active",
    ],
    rows.map((s) => [
      s.id,
      s.name,
      s.phone,
      s.contact_person,
      s.credit_limit,
      s.payables_balance,
      s.is_active,
    ])
  );
}

async function fetchSaleIdsInRange(
  organizationId: string,
  fromDate: string,
  toDate: string,
  outletId?: string | null
): Promise<
  {
    id: string;
    invoice_no: string;
    sale_date: string;
    outlet_id: string | null;
    customer_id: string | null;
  }[]
> {
  const supabase = await createServerSupabaseClient();
  const { from, to } = periodBounds(fromDate, toDate);
  const pageSize = 500;
  const all: {
    id: string;
    invoice_no: string;
    sale_date: string;
    outlet_id: string | null;
    customer_id: string | null;
  }[] = [];
  let page = 0;

  while (true) {
    let query = supabase
      .from("sales")
      .select("id, invoice_no, sale_date, outlet_id, customer_id")
      .eq("organization_id", organizationId)
      .gte("sale_date", from!)
      .lte("sale_date", to!);
    if (outletId) query = query.eq("outlet_id", outletId);

    const { data, error } = await query
      .order("sale_date", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    page += 1;
  }

  return all;
}

async function exportSalesCsv(
  fromDate: string,
  toDate: string,
  outletId?: string | null
): Promise<string> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { from, to } = periodBounds(fromDate, toDate);

  const pageSize = 500;
  const rows: unknown[][] = [];
  let page = 0;

  while (true) {
    let query = supabase
      .from("sales")
      .select(
        "id, invoice_no, sale_type, sale_date, outlet_id, customer_id, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, deposit_applied, status"
      )
      .eq("organization_id", ctx.organizationId)
      .gte("sale_date", from!)
      .lte("sale_date", to!);
    if (outletId) query = query.eq("outlet_id", outletId);

    const { data, error } = await query
      .order("sale_date", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const s of data) {
      rows.push([
        s.id,
        s.invoice_no,
        s.sale_type,
        businessDateFromTimestamptz(String(s.sale_date)),
        s.outlet_id,
        s.customer_id,
        s.subtotal,
        s.discount_amount,
        s.tax_amount,
        s.total_amount,
        s.amount_paid,
        s.balance_due,
        s.deposit_applied,
        s.status,
      ]);
    }
    if (data.length < pageSize) break;
    page += 1;
  }

  return csvDocument(
    [
      "sale_id",
      "invoice_no",
      "sale_type",
      "sale_date",
      "outlet_id",
      "customer_id",
      "subtotal",
      "discount",
      "tax",
      "total",
      "amount_paid",
      "balance_due",
      "deposit_applied",
      "status",
    ],
    rows
  );
}

async function exportSaleItemsCsv(
  fromDate: string,
  toDate: string,
  outletId?: string | null
): Promise<string> {
  const ctx = await requireOrgContext();
  const sales = await fetchSaleIdsInRange(
    ctx.organizationId,
    fromDate,
    toDate,
    outletId
  );
  const saleMap = new Map(
    sales.map((s) => [
      s.id,
      {
        invoice_no: s.invoice_no,
        sale_date: businessDateFromTimestamptz(String(s.sale_date)),
      },
    ])
  );
  const saleIds = sales.map((s) => s.id);
  if (saleIds.length === 0) {
    return csvDocument(
      [
        "sale_id",
        "invoice_no",
        "sale_date",
        "product_id",
        "product_name",
        "quantity_base",
        "sell_qty",
        "sell_unit",
        "unit_price",
        "discount_pct",
        "line_total",
      ],
      []
    );
  }

  const supabase = await createServerSupabaseClient();
  const items = await fetchByInChunks(saleIds, async (chunk) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, product_name, quantity, sell_qty, sell_unit, unit_price, discount_pct, total_price"
      )
      .in("sale_id", chunk);
    return { data, error };
  });

  return csvDocument(
    [
      "sale_id",
      "invoice_no",
      "sale_date",
      "product_id",
      "product_name",
      "quantity_base",
      "sell_qty",
      "sell_unit",
      "unit_price",
      "discount_pct",
      "line_total",
    ],
    items.map((i) => {
      const sale = saleMap.get(i.sale_id as string);
      return [
        i.sale_id,
        sale?.invoice_no ?? "",
        sale?.sale_date ?? "",
        i.product_id,
        i.product_name,
        i.quantity,
        i.sell_qty,
        i.sell_unit,
        i.unit_price,
        i.discount_pct,
        i.total_price,
      ];
    })
  );
}

async function exportPaymentsCsv(
  fromDate: string,
  toDate: string,
  outletId?: string | null
): Promise<string> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { from, to } = periodBounds(fromDate, toDate);
  const pageSize = 500;
  const rows: unknown[][] = [];
  let page = 0;

  while (true) {
    let query = supabase
      .from("payments")
      .select(
        "id, sale_id, outlet_id, payment_method, amount, status, payment_date, payment_account_id"
      )
      .eq("organization_id", ctx.organizationId)
      .gte("payment_date", from!)
      .lte("payment_date", to!);
    if (outletId) query = query.eq("outlet_id", outletId);

    const { data, error } = await query
      .order("payment_date", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const p of data) {
      rows.push([
        p.id,
        p.sale_id,
        p.outlet_id,
        p.payment_method,
        p.amount,
        p.status,
        businessDateFromTimestamptz(String(p.payment_date)),
        p.payment_account_id,
      ]);
    }
    if (data.length < pageSize) break;
    page += 1;
  }

  return csvDocument(
    [
      "payment_id",
      "sale_id",
      "outlet_id",
      "payment_method",
      "amount",
      "status",
      "payment_date",
      "payment_account_id",
    ],
    rows
  );
}

async function exportExpensesCsv(
  fromDate: string,
  toDate: string,
  outletId?: string | null
): Promise<string> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("expenses")
    .select(
      "id, outlet_id, category, description, amount, payment_method, reference_no, expense_date"
    )
    .eq("organization_id", ctx.organizationId)
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate);
  if (outletId) query = query.eq("outlet_id", outletId);

  const { data, error } = await query.order("expense_date", { ascending: true });
  if (error) throw new Error(error.message);

  return csvDocument(
    [
      "expense_id",
      "outlet_id",
      "category",
      "description",
      "amount",
      "payment_method",
      "reference_no",
      "expense_date",
    ],
    (data ?? []).map((e) => [
      e.id,
      e.outlet_id,
      e.category,
      e.description,
      e.amount,
      e.payment_method,
      e.reference_no,
      e.expense_date,
    ])
  );
}

async function exportJournalLinesCsv(
  fromDate: string,
  toDate: string
): Promise<string> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: entries, error: entErr } = await supabase
    .from("journal_entries")
    .select("id, entry_date, description, source_type, source_id, is_posted")
    .eq("organization_id", ctx.organizationId)
    .eq("is_posted", true)
    .gte("entry_date", fromDate)
    .lte("entry_date", toDate)
    .order("entry_date", { ascending: true });
  if (entErr) throw new Error(entErr.message);

  const entryIds = (entries ?? []).map((e) => e.id);
  const entryMap = new Map(
    (entries ?? []).map((e) => [
      e.id,
      {
        entry_date: e.entry_date,
        description: e.description,
        source_type: e.source_type,
        source_id: e.source_id,
      },
    ])
  );

  if (entryIds.length === 0) {
    return csvDocument(
      [
        "entry_date",
        "entry_description",
        "source_type",
        "source_id",
        "account_code",
        "account_name",
        "debit",
        "credit",
        "memo",
      ],
      []
    );
  }

  const lines = await fetchByInChunks(entryIds, async (chunk) => {
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit, credit, memo")
      .in("journal_entry_id", chunk);
    return { data, error };
  });

  const accountIds = Array.from(new Set(lines.map((l) => l.account_id)));
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name")
    .in("id", accountIds);
  const accountMap = new Map(
    (accounts ?? []).map((a) => [a.id, { code: a.code, name: a.name }])
  );

  return csvDocument(
    [
      "entry_date",
      "entry_description",
      "source_type",
      "source_id",
      "account_code",
      "account_name",
      "debit",
      "credit",
      "memo",
    ],
    lines.map((l) => {
      const entry = entryMap.get(l.journal_entry_id as string);
      const acct = accountMap.get(l.account_id as string);
      return [
        entry?.entry_date ?? "",
        entry?.description ?? "",
        entry?.source_type ?? "",
        entry?.source_id ?? "",
        acct?.code ?? "",
        acct?.name ?? "",
        l.debit,
        l.credit,
        l.memo,
      ];
    })
  );
}
