import type {
  CustomerOpenInvoice,
  PartyStatementLine,
} from "@/lib/actions/party-statements";

export async function fetchSupplierStatement(
  supplierId: string
): Promise<PartyStatementLine[]> {
  const res = await fetch(
    `/api/finance/statements/supplier?supplierId=${supplierId}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    lines?: PartyStatementLine[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "Failed to load statement");
  return body.lines ?? [];
}

export async function fetchCustomerStatement(
  customerId: string
): Promise<PartyStatementLine[]> {
  const res = await fetch(
    `/api/finance/statements/customer?customerId=${customerId}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    lines?: PartyStatementLine[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "Failed to load statement");
  return body.lines ?? [];
}

export async function fetchCustomerOpenInvoices(
  customerId: string
): Promise<CustomerOpenInvoice[]> {
  const res = await fetch(
    `/api/finance/customer-invoices?customerId=${customerId}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    invoices?: CustomerOpenInvoice[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "Failed to load invoices");
  return body.invoices ?? [];
}
