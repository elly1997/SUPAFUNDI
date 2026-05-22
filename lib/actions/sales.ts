"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildReversingJournalLines,
  buildSaleJournalLines,
  type JournalLineInput,
} from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { creditAccountFromPosSale } from "@/lib/actions/banking";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  computeLineTotal,
  roundMoney,
} from "@/lib/utils/calculations";
import {
  computeTaxAmount,
  effectiveTaxRate,
  getOrgVatConfig,
} from "@/lib/vat/org-vat";
import {
  formatInvoiceNo,
  outletInvoicePrefix,
} from "@/lib/utils/invoice-number";
import type { PosCustomer } from "@/lib/api/customers-fetch";
import { isoDateToTimestamptz, resolveBusinessDate } from "@/lib/utils/iso-date";
import {
  maxSellQtyInUnit,
  sellQtyToBaseQty,
} from "@/lib/products/units";

function saleLineAsUnit(line: {
  sellUnit: string;
  factorToBase: number;
  unitsPerBase?: boolean;
}) {
  return {
    id: "",
    unitLabel: line.sellUnit,
    factorToBase: line.factorToBase,
    isBase: line.factorToBase === 1 && !line.unitsPerBase,
    unitsPerBase: line.unitsPerBase,
    retailPrice: null as number | null,
    wholesalePrice: null as number | null,
    sortOrder: 0,
  };
}

const saleLineInput = z.object({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  /** Quantity in the sell unit (box, pcs, etc.). */
  quantity: z.number().positive(),
  sellUnit: z.string().min(1).default("pcs"),
  factorToBase: z.number().positive().default(1),
  unitsPerBase: z.boolean().optional(),
  unitPrice: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).default(0),
});

const completeSaleInput = z.object({
  outletId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  saleType: z.enum(["retail", "wholesale"]).default("retail"),
  lines: z.array(saleLineInput).min(1, "Cart is empty"),
  cartDiscountAmount: z.number().nonnegative().default(0),
  taxRate: z.number().min(0).max(100).default(18),
  paymentMethod: z.enum([
    "cash",
    "mpesa",
    "card",
    "bank_transfer",
    "credit_account",
    "cheque",
  ]),
  amountPaid: z.number().nonnegative(),
  /** Bank / M-Pesa / Lipa account to credit when collecting electronically */
  paymentAccountId: z.string().uuid().optional(),
  /** Apply up to this amount from customer deposit_balance */
  depositApplied: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  /** Business date (YYYY-MM-DD); defaults to today. Used for backdated POS sales. */
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CompleteSaleInput = z.infer<typeof completeSaleInput>;

export type CompleteSaleResult =
  | {
      ok: true;
      saleId: string;
      invoiceNo: string;
      totalAmount: number;
      changeGiven: number;
      balanceDue: number;
    }
  | { ok: false; message: string };

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type StockRollback = {
  stockId: string;
  quantity: number;
};

async function generateInvoiceNo(
  supabase: Supabase,
  organizationId: string,
  outletId: string
): Promise<string> {
  const { data: outlet } = await supabase
    .from("outlets")
    .select("name, code")
    .eq("id", outletId)
    .eq("organization_id", organizationId)
    .single();
  const prefix =
    outlet?.code?.trim().toUpperCase() ||
    outletInvoicePrefix(outlet?.name ?? "OUT");
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01T00:00:00.000Z`;

  const { count } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("outlet_id", outletId)
    .gte("sale_date", yearStart);

  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = (count ?? 0) + 1 + attempt;
    const invoiceNo = formatInvoiceNo(prefix, year, seq);
    const { data: existing } = await supabase
      .from("sales")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("invoice_no", invoiceNo)
      .maybeSingle();
    if (!existing) {
      return invoiceNo;
    }
  }
  return formatInvoiceNo(prefix, year, Date.now() % 100000);
}

async function rollbackSale(
  supabase: Supabase,
  saleId: string,
  stockRollbacks: StockRollback[]
): Promise<void> {
  for (const r of stockRollbacks) {
    const { data: row } = await supabase
      .from("stock")
      .select("quantity")
      .eq("id", r.stockId)
      .single();
    if (row) {
      await supabase
        .from("stock")
        .update({ quantity: Number(row.quantity) + r.quantity })
        .eq("id", r.stockId);
    }
  }
  await supabase.from("stock_movements").delete().eq("reference_id", saleId);
  await supabase.from("credit_ledger").delete().eq("reference_id", saleId);
  await supabase.from("sales").delete().eq("id", saleId);
}

export async function completeSale(
  raw: CompleteSaleInput
): Promise<CompleteSaleResult> {
  const stockRollbacks: StockRollback[] = [];
  let saleId: string | null = null;

  try {
    const input = completeSaleInput.parse(raw);
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
      return { ok: false, message: "Invalid outlet for your organization." };
    }

    const productIds = input.lines.map((l) => l.productId);
    const { data: stockRows, error: stockErr } = await supabase
      .from("stock")
      .select("id, product_id, quantity, cost_price")
      .eq("outlet_id", input.outletId)
      .eq("organization_id", ctx.organizationId)
      .in("product_id", productIds);
    if (stockErr) {
      return { ok: false, message: stockErr.message };
    }
    const stockByProduct = new Map(
      (stockRows ?? []).map((s) => [s.product_id, s])
    );

    let cogsAmount = 0;
    for (const line of input.lines) {
      const stock = stockByProduct.get(line.productId);
      const baseQty = roundMoney(
        sellQtyToBaseQty(line.quantity, saleLineAsUnit(line))
      );
      if (!stock) {
        return {
          ok: false,
          message: `No stock record for "${line.productName}" at this outlet.`,
        };
      }
      if (Number(stock.quantity) < baseQty) {
        const availSell = maxSellQtyInUnit(
          Number(stock.quantity),
          saleLineAsUnit(line)
        );
        return {
          ok: false,
          message: `Insufficient stock for "${line.productName}" (available: ${availSell} ${line.sellUnit}).`,
        };
      }
      cogsAmount += baseQty * Number(stock.cost_price);
    }
    cogsAmount = roundMoney(cogsAmount);

    const lineTotals = input.lines.map((l) =>
      computeLineTotal(l.quantity, l.unitPrice, l.discountPct)
    );
    const subtotal = roundMoney(
      lineTotals.reduce((s, t) => s + t, 0)
    );
    const discountAmount = roundMoney(
      Math.min(input.cartDiscountAmount, subtotal)
    );
    const taxableBase = roundMoney(subtotal - discountAmount);
    const taxAmount = computeTaxAmount(taxableBase, vatConfig, taxRate);
    const totalAmount = roundMoney(taxableBase + taxAmount);

    let depositApplied = 0;
    if (input.customerId && (input.depositApplied ?? 0) > 0) {
      const { data: depCust } = await supabase
        .from("customers")
        .select("deposit_balance")
        .eq("id", input.customerId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      const available = Number(depCust?.deposit_balance ?? 0);
      depositApplied = roundMoney(
        Math.min(available, totalAmount, input.depositApplied ?? 0)
      );
    }

    const totalPaid = roundMoney(input.amountPaid + depositApplied);
    const balanceDue = roundMoney(Math.max(0, totalAmount - totalPaid));
    const changeGiven = roundMoney(Math.max(0, totalPaid - totalAmount));

    if (balanceDue > 0 && !input.customerId) {
      return {
        ok: false,
        message: "Select a customer for credit or partial payment sales.",
      };
    }

    if (input.customerId && balanceDue > 0) {
      const { data: customer } = await supabase
        .from("customers")
        .select(
          "id, name, credit_limit, outstanding_balance, credit_days, is_active"
        )
        .eq("id", input.customerId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (!customer?.is_active) {
        return { ok: false, message: "Customer not found or inactive." };
      }
      const newBalance =
        Number(customer.outstanding_balance) + balanceDue;
      if (
        Number(customer.credit_limit) > 0 &&
        newBalance > Number(customer.credit_limit)
      ) {
        return {
          ok: false,
          message: `Credit limit exceeded for ${customer.name}.`,
        };
      }
      if (
        Number(customer.credit_limit) === 0 &&
        input.paymentMethod === "credit_account" &&
        input.amountPaid === 0
      ) {
        return {
          ok: false,
          message: `${customer.name} has no credit limit set.`,
        };
      }
    }

    const businessDate = resolveBusinessDate(input.businessDate);
    const saleTimestamp = isoDateToTimestamptz(businessDate);

    const invoiceNo = await generateInvoiceNo(
      supabase,
      ctx.organizationId,
      input.outletId
    );

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        invoice_no: invoiceNo,
        sale_type: input.saleType,
        status: "completed",
        customer_id: input.customerId ?? null,
        subtotal,
        discount_amount: discountAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_paid: roundMoney(Math.min(totalPaid, totalAmount)),
        deposit_applied: depositApplied,
        change_given: changeGiven,
        balance_due: balanceDue,
        notes: input.notes?.trim() || null,
        cashier_id: ctx.userId,
        sale_date: saleTimestamp,
      })
      .select("id")
      .single();

    if (saleErr || !sale) {
      return { ok: false, message: saleErr?.message ?? "Could not create sale." };
    }
    saleId = sale.id;

    const saleItemsBase = input.lines.map((l, i) => ({
      sale_id: sale.id,
      product_id: l.productId,
      product_name: l.productName,
      quantity: roundMoney(sellQtyToBaseQty(l.quantity, saleLineAsUnit(l))),
      unit_price: l.unitPrice,
      discount_pct: l.discountPct,
      tax_rate: taxRate,
      total_price: lineTotals[i],
    }));
    const saleItemsFull = input.lines.map((l, i) => ({
      ...saleItemsBase[i]!,
      sell_unit: l.sellUnit,
      sell_qty: l.quantity,
    }));
    let itemsErr = (
      await supabase.from("sale_items").insert(saleItemsFull)
    ).error;
    if (itemsErr?.message.includes("sell_unit")) {
      itemsErr = (await supabase.from("sale_items").insert(saleItemsBase)).error;
    }
    if (itemsErr) {
      await rollbackSale(supabase, sale.id, stockRollbacks);
      return { ok: false, message: itemsErr.message };
    }

    if (input.amountPaid > 0) {
      const payAmount = roundMoney(Math.min(input.amountPaid, totalAmount));
      const paymentBase = {
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        sale_id: sale.id,
        payment_method: input.paymentMethod,
        amount: payAmount,
        status: "completed" as const,
        received_by: ctx.userId,
        payment_date: saleTimestamp,
      };
      let payErr = (
        await supabase.from("payments").insert({
          ...paymentBase,
          ...(input.paymentAccountId
            ? { payment_account_id: input.paymentAccountId }
            : {}),
        })
      ).error;
      if (payErr?.message.includes("payment_account_id")) {
        payErr = (await supabase.from("payments").insert(paymentBase)).error;
      }
      if (payErr) {
        await rollbackSale(supabase, sale.id, stockRollbacks);
        return { ok: false, message: payErr.message };
      }

      const routesToAccount =
        input.paymentAccountId &&
        payAmount > 0 &&
        (input.paymentMethod === "mpesa" ||
          input.paymentMethod === "bank_transfer" ||
          input.paymentMethod === "card");
      if (routesToAccount) {
        const credit = await creditAccountFromPosSale(
          input.paymentAccountId!,
          payAmount,
          sale.id,
          invoiceNo,
          input.businessDate
        );
        if (!credit.ok) {
          await rollbackSale(supabase, sale.id, stockRollbacks);
          return { ok: false, message: credit.message };
        }
      }
    }

    if (depositApplied > 0 && input.customerId) {
      const { data: depRow } = await supabase
        .from("customers")
        .select("deposit_balance")
        .eq("id", input.customerId)
        .single();
      const newDep = roundMoney(
        Number(depRow?.deposit_balance ?? 0) - depositApplied
      );
      const { error: depErr } = await supabase
        .from("customers")
        .update({ deposit_balance: newDep })
        .eq("id", input.customerId);
      if (depErr) {
        await rollbackSale(supabase, sale.id, stockRollbacks);
        return { ok: false, message: depErr.message };
      }
    }

    for (const line of input.lines) {
      const stock = stockByProduct.get(line.productId)!;
      const baseQty = roundMoney(
        sellQtyToBaseQty(line.quantity, saleLineAsUnit(line))
      );
      const newQty = roundMoney(Number(stock.quantity) - baseQty);
      const { error: updErr } = await supabase
        .from("stock")
        .update({ quantity: newQty })
        .eq("id", stock.id);
      if (updErr) {
        await rollbackSale(supabase, sale.id, stockRollbacks);
        return { ok: false, message: updErr.message };
      }
      stockRollbacks.push({ stockId: stock.id, quantity: baseQty });

      const { error: movErr } = await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        product_id: line.productId,
        movement_type: "sale",
        quantity: baseQty,
        unit_cost: Number(stock.cost_price),
        reference_id: sale.id,
        reference_type: "sale",
        notes: `Sale ${invoiceNo}`,
        created_by: ctx.userId,
        created_at: saleTimestamp,
      });
      if (movErr) {
        await rollbackSale(supabase, sale.id, stockRollbacks);
        return { ok: false, message: movErr.message };
      }
    }

    if (balanceDue > 0 && input.customerId) {
      const { data: customer } = await supabase
        .from("customers")
        .select("outstanding_balance, credit_days")
        .eq("id", input.customerId)
        .single();
      const prevBalance = Number(customer?.outstanding_balance ?? 0);
      const newBalance = roundMoney(prevBalance + balanceDue);
      const dueDate = new Date();
      dueDate.setDate(
        dueDate.getDate() + Number(customer?.credit_days ?? 30)
      );

      const { error: ledgerErr } = await supabase.from("credit_ledger").insert({
        organization_id: ctx.organizationId,
        customer_id: input.customerId,
        entry_type: "invoice",
        reference_id: sale.id,
        reference_type: "sale",
        debit: balanceDue,
        credit: 0,
        balance: newBalance,
        description: `Invoice ${invoiceNo}`,
        due_date: dueDate.toISOString().slice(0, 10),
        created_by: ctx.userId,
      });
      if (ledgerErr) {
        await rollbackSale(supabase, sale.id, stockRollbacks);
        return { ok: false, message: ledgerErr.message };
      }

      const { error: custErr } = await supabase
        .from("customers")
        .update({ outstanding_balance: newBalance })
        .eq("id", input.customerId);
      if (custErr) {
        await rollbackSale(supabase, sale.id, stockRollbacks);
        return { ok: false, message: custErr.message };
      }
    }

    const glPaymentMethod =
      balanceDue > 0 && totalPaid === 0
        ? ("credit_account" as const)
        : input.paymentMethod;

    const cashAmountPaid = roundMoney(Math.min(input.amountPaid, totalAmount));

    const journalLines = buildSaleJournalLines({
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      cashAmountPaid,
      depositApplied,
      balanceDue,
      paymentMethod: glPaymentMethod,
      cogsAmount,
    });

    const journal = await postJournalEntry({
      description: `POS sale ${invoiceNo}`,
      sourceType: "sale",
      sourceId: sale.id,
      outletId: input.outletId,
      lines: journalLines,
    });

    if (!journal.ok) {
      if (balanceDue > 0 && input.customerId) {
        const { data: customer } = await supabase
          .from("customers")
          .select("outstanding_balance")
          .eq("id", input.customerId)
          .single();
        const restored = roundMoney(
          Number(customer?.outstanding_balance ?? 0) - balanceDue
        );
        await supabase
          .from("customers")
          .update({ outstanding_balance: Math.max(0, restored) })
          .eq("id", input.customerId);
      }
      await rollbackSale(supabase, sale.id, stockRollbacks);
      return {
        ok: false,
        message: `Sale rolled back: ${journal.message}`,
      };
    }

    revalidatePath("/pos");
    revalidatePath("/sales");
    revalidatePath("/invoices");
    revalidatePath("/inventory/stock");

    return {
      ok: true,
      saleId: sale.id,
      invoiceNo,
      totalAmount,
      changeGiven,
      balanceDue,
    };
  } catch (e) {
    if (saleId) {
      const supabase = await createServerSupabaseClient();
      await rollbackSale(supabase, saleId, stockRollbacks);
    }
    const message = e instanceof Error ? e.message : "Checkout failed";
    return { ok: false, message };
  }
}

export type SaleListRow = {
  id: string;
  invoice_no: string;
  sale_type: string;
  sale_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  customer_name: string | null;
};

export async function listRecentSales(
  limit = 50,
  filters?: {
    outletId?: string | null;
    fromDate?: string;
    toDate?: string;
  }
): Promise<SaleListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("sales")
    .select(
      "id, invoice_no, sale_type, sale_date, total_amount, amount_paid, balance_due, status, customer_id"
    )
    .eq("organization_id", ctx.organizationId);
  if (filters?.outletId) {
    query = query.eq("outlet_id", filters.outletId);
  }
  if (filters?.fromDate) {
    query = query.gte("sale_date", `${filters.fromDate}T00:00:00.000Z`);
  }
  if (filters?.toDate) {
    query = query.lte("sale_date", `${filters.toDate}T23:59:59.999Z`);
  }
  const { data, error } = await query
    .order("sale_date", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  const rows = data ?? [];
  const customerIds = Array.from(
    new Set(
      rows.map((r) => r.customer_id).filter((id): id is string => !!id)
    )
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
  return rows.map((row) => ({
    id: row.id,
    invoice_no: row.invoice_no,
    sale_type: row.sale_type,
    sale_date: row.sale_date,
    total_amount: Number(row.total_amount),
    amount_paid: Number(row.amount_paid),
    balance_due: Number(row.balance_due),
    status: row.status,
    customer_name: row.customer_id
      ? (customerNames.get(row.customer_id) ?? null)
      : null,
  }));
}

export type SaleDetail = {
  id: string;
  invoice_no: string;
  sale_type: string;
  sale_date: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_given: number;
  balance_due: number;
  notes: string | null;
  customer_name: string | null;
  items: {
    product_name: string;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    total_price: number;
  }[];
};

export async function getSaleById(saleId: string): Promise<SaleDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: sale, error } = await supabase
    .from("sales")
    .select(
      "id, invoice_no, sale_type, sale_date, status, subtotal, discount_amount, tax_rate, tax_amount, total_amount, amount_paid, change_given, balance_due, notes, customer_id"
    )
    .eq("id", saleId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error || !sale) {
    return null;
  }
  const { data: items } = await supabase
    .from("sale_items")
    .select(
      "product_name, quantity, unit_price, discount_pct, total_price"
    )
    .eq("sale_id", saleId);
  let customerName: string | null = null;
  if (sale.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", sale.customer_id)
      .maybeSingle();
    customerName = customer?.name ?? null;
  }
  return {
    id: sale.id,
    invoice_no: sale.invoice_no,
    sale_type: sale.sale_type,
    sale_date: sale.sale_date,
    status: sale.status,
    subtotal: Number(sale.subtotal),
    discount_amount: Number(sale.discount_amount),
    tax_rate: Number(sale.tax_rate),
    tax_amount: Number(sale.tax_amount),
    total_amount: Number(sale.total_amount),
    amount_paid: Number(sale.amount_paid),
    change_given: Number(sale.change_given),
    balance_due: Number(sale.balance_due),
    notes: sale.notes,
    customer_name: customerName,
    items: (items ?? []).map((i) => ({
      product_name: i.product_name,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
      total_price: Number(i.total_price),
    })),
  };
}

export type { PosCustomer };

async function loadSaleJournalLines(
  supabase: Supabase,
  saleId: string
): Promise<JournalLineInput[]> {
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_id", saleId)
    .eq("source_type", "sale")
    .eq("is_reversal", false)
    .maybeSingle();
  if (!entry) return [];

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("debit, credit, account_id")
    .eq("journal_entry_id", entry.id);
  if (!lines?.length) return [];

  const accountIds = Array.from(new Set(lines.map((l) => l.account_id)));
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code")
    .in("id", accountIds);
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  return lines
    .map((l) => {
      const code = codeById.get(l.account_id);
      if (!code) return null;
      return {
        accountCode: code,
        debit: Number(l.debit),
        credit: Number(l.credit),
      };
    })
    .filter((l): l is JournalLineInput => l !== null);
}

/** Void a completed sale: reverse GL, restore stock, reverse AR/deposit effects. */
export async function voidSale(
  saleId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: sale } = await supabase
      .from("sales")
      .select(
        "id, invoice_no, status, outlet_id, customer_id, balance_due, deposit_applied, sale_date"
      )
      .eq("id", saleId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!sale) return { ok: false, message: "Sale not found." };
    if (sale.status !== "completed") {
      return { ok: false, message: "Only completed sales can be voided." };
    }

    const { data: items } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", saleId);
    if (!items?.length) {
      return { ok: false, message: "Sale has no line items." };
    }

    const originalLines = await loadSaleJournalLines(supabase, saleId);
    if (originalLines.length > 0) {
      const reverseLines = buildReversingJournalLines(originalLines);
      const journal = await postJournalEntry({
        description: `Void sale ${sale.invoice_no}`,
        sourceType: "sale_return",
        sourceId: saleId,
        outletId: sale.outlet_id ?? undefined,
        lines: reverseLines,
      });
      if (!journal.ok) {
        return { ok: false, message: journal.message };
      }
    }

    for (const line of items) {
      if (!line.product_id || !sale.outlet_id) continue;
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity")
        .eq("outlet_id", sale.outlet_id)
        .eq("product_id", line.product_id)
        .maybeSingle();
      const qty = Number(line.quantity);
      if (stock?.id) {
        await supabase
          .from("stock")
          .update({ quantity: roundMoney(Number(stock.quantity) + qty) })
          .eq("id", stock.id);
      }
      await supabase.from("stock_movements").insert({
        organization_id: ctx.organizationId,
        outlet_id: sale.outlet_id,
        product_id: line.product_id,
        movement_type: "return_in",
        quantity: qty,
        reference_id: saleId,
        reference_type: "sale_void",
        notes: `Void ${sale.invoice_no}`,
        created_by: ctx.userId,
        created_at: sale.sale_date,
      });
    }

    const balanceDue = Number(sale.balance_due);
    if (balanceDue > 0 && sale.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("outstanding_balance")
        .eq("id", sale.customer_id)
        .single();
      const restored = roundMoney(
        Math.max(0, Number(customer?.outstanding_balance ?? 0) - balanceDue)
      );
      await supabase
        .from("customers")
        .update({ outstanding_balance: restored })
        .eq("id", sale.customer_id);
      await supabase.from("credit_ledger").insert({
        organization_id: ctx.organizationId,
        customer_id: sale.customer_id,
        entry_type: "credit_note",
        reference_id: saleId,
        reference_type: "sale_void",
        debit: 0,
        credit: balanceDue,
        balance: restored,
        description: `Void ${sale.invoice_no}`,
        created_by: ctx.userId,
      });
    }

    const depositApplied = Number(sale.deposit_applied ?? 0);
    if (depositApplied > 0 && sale.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("deposit_balance")
        .eq("id", sale.customer_id)
        .single();
      await supabase
        .from("customers")
        .update({
          deposit_balance: roundMoney(
            Number(customer?.deposit_balance ?? 0) + depositApplied
          ),
        })
        .eq("id", sale.customer_id);
    }

    await supabase
      .from("sales")
      .update({ status: "cancelled" })
      .eq("id", saleId);

    revalidatePath("/sales");
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/pos");
    revalidatePath("/inventory/stock");
    revalidatePath("/finance/credit");
    revalidatePath("/reports");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Void sale failed",
    };
  }
}

/** @deprecated Prefer fetchPosCustomers() from client; kept for API route. */
export async function listCustomersForPos(): Promise<PosCustomer[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, outstanding_balance, credit_limit, price_type")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("name")
    .limit(200);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    outstanding_balance: Number(c.outstanding_balance),
    credit_limit: Number(c.credit_limit),
    price_type: c.price_type ?? "retail",
  }));
}
