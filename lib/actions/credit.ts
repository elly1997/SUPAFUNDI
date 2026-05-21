"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildCustomerPaymentJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { creditAccountFromPosSale } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { listCustomerOpenInvoices } from "@/lib/actions/party-statements";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function paymentsDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

export type CustomerBalanceRow = {
  id: string;
  name: string;
  phone: string | null;
  outstanding_balance: number;
  credit_limit: number;
};

export async function listCustomersWithBalance(): Promise<CustomerBalanceRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, outstanding_balance, credit_limit")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .gt("outstanding_balance", 0)
    .order("outstanding_balance", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    outstanding_balance: Number(c.outstanding_balance),
    credit_limit: Number(c.credit_limit),
  }));
}

const allocationSchema = z.object({
  saleId: z.string().uuid(),
  amount: z.number().positive(),
});

const paymentInput = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer"]).default("cash"),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  payAll: z.boolean().optional(),
  allocations: z.array(allocationSchema).optional(),
});

export async function recordCustomerPayment(
  raw: z.infer<typeof paymentInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = paymentInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const paymentDate =
      input.paymentDate ?? new Date().toISOString().slice(0, 10);
    const paymentTs = `${paymentDate}T12:00:00.000Z`;

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, outstanding_balance")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) {
      return { ok: false, message: "Customer not found." };
    }

    const openInvoices = await listCustomerOpenInvoices(input.customerId);
    let slices: { saleId: string; amount: number }[] = [];

    if (input.payAll) {
      const totalDue = roundMoney(
        openInvoices.reduce((s, i) => s + i.balanceDue, 0)
      );
      if (roundMoney(input.amount) !== totalDue) {
        return {
          ok: false,
          message: `Pay-all requires ${totalDue} (open invoices total).`,
        };
      }
      slices = openInvoices.map((i) => ({
        saleId: i.saleId,
        amount: i.balanceDue,
      }));
    } else if (input.allocations?.length) {
      const allocTotal = roundMoney(
        input.allocations.reduce((s, a) => s + a.amount, 0)
      );
      if (allocTotal !== roundMoney(input.amount)) {
        return {
          ok: false,
          message: "Allocation amounts must equal payment amount.",
        };
      }
      for (const a of input.allocations) {
        const inv = openInvoices.find((i) => i.saleId === a.saleId);
        if (!inv) {
          return { ok: false, message: "Invoice not open or not found." };
        }
        if (a.amount > inv.balanceDue) {
          return {
            ok: false,
            message: `Amount exceeds due on ${inv.invoiceNo}.`,
          };
        }
        slices.push(a);
      }
    } else {
      let remaining = input.amount;
      for (const inv of openInvoices) {
        if (remaining <= 0) break;
        const slice = roundMoney(Math.min(remaining, inv.balanceDue));
        if (slice > 0) {
          slices.push({ saleId: inv.saleId, amount: slice });
          remaining = roundMoney(remaining - slice);
        }
      }
      if (remaining > 0) {
        return {
          ok: false,
          message: `Payment exceeds open invoices by ${remaining}.`,
        };
      }
    }

    const owed = Number(customer.outstanding_balance);
    if (input.amount > owed) {
      return {
        ok: false,
        message: `Payment exceeds balance (${owed}).`,
      };
    }

    for (const slice of slices) {
      const { data: sale } = await supabase
        .from("sales")
        .select("id, amount_paid, balance_due, invoice_no")
        .eq("id", slice.saleId)
        .eq("customer_id", input.customerId)
        .maybeSingle();
      if (!sale) {
        return { ok: false, message: "Sale not found." };
      }
      const newPaid = roundMoney(Number(sale.amount_paid) + slice.amount);
      const newDue = roundMoney(Number(sale.balance_due) - slice.amount);
      const { error: saleErr } = await supabase
        .from("sales")
        .update({
          amount_paid: newPaid,
          balance_due: Math.max(0, newDue),
        } as { amount_paid: number; balance_due: number })
        .eq("id", slice.saleId);
      if (saleErr) return { ok: false, message: saleErr.message };

      await paymentsDb(supabase).from("payments").insert({
        organization_id: ctx.organizationId,
        outlet_id: ctx.outletId,
        sale_id: slice.saleId,
        payment_method: input.paymentMethod,
        amount: slice.amount,
        reference_no:
          input.referenceNo?.trim() ||
          `AR-${sale.invoice_no}`,
        status: "completed",
        payment_date: paymentTs,
        received_by: ctx.userId,
        customer_id: input.customerId,
      });
    }

    const newBalance = roundMoney(owed - input.amount);
    const { data: ledger, error: ledgerErr } = await paymentsDb(supabase)
      .from("credit_ledger")
      .insert({
        organization_id: ctx.organizationId,
        customer_id: input.customerId,
        entry_type: "payment",
        reference_type: "customer_payment",
        debit: 0,
        credit: input.amount,
        balance: newBalance,
        description:
          input.notes?.trim() ||
          `Payment received — ${input.referenceNo ?? input.paymentMethod}`,
        entry_date: paymentDate,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ledgerErr || !ledger) {
      return { ok: false, message: ledgerErr?.message ?? "Ledger insert failed" };
    }

    if (slices.length === 0) {
      await paymentsDb(supabase).from("payments").insert({
        organization_id: ctx.organizationId,
        outlet_id: ctx.outletId,
        payment_method: input.paymentMethod,
        amount: input.amount,
        reference_no: input.referenceNo?.trim() || `AR-${customer.name}`,
        status: "completed",
        payment_date: paymentTs,
        received_by: ctx.userId,
        customer_id: input.customerId,
      });
    }

    const { error: custErr } = await supabase
      .from("customers")
      .update({ outstanding_balance: newBalance })
      .eq("id", input.customerId);
    if (custErr) {
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
      return { ok: false, message: custErr.message };
    }

    const journal = await postJournalEntry({
      description: `Customer payment — ${customer.name}`,
      sourceType: "payment",
      sourceId: ledger.id,
      outletId: ctx.outletId ?? undefined,
      entryDate: paymentDate,
      lines: buildCustomerPaymentJournalLines(
        input.amount,
        input.paymentMethod
      ),
    });
    if (!journal.ok) {
      await supabase
        .from("customers")
        .update({ outstanding_balance: owed })
        .eq("id", input.customerId);
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
      return { ok: false, message: journal.message };
    }

    if (
      input.bankAccountId &&
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer")
    ) {
      const bank = await creditAccountFromPosSale(
        input.bankAccountId,
        input.amount,
        ledger.id,
        `AR-${customer.name}`,
        paymentDate
      );
      if (!bank.ok) return bank;
    }

    revalidatePath("/finance/credit");
    revalidatePath("/customers");
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath("/finance/banking");
    revalidatePath("/daily-closing");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Payment failed",
    };
  }
}
