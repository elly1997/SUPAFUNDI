import type { CustomerListRow } from "@/lib/actions/customers";
import type { CustomerBalanceRow } from "@/lib/actions/credit";

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  outstanding_balance: number;
  credit_limit: number;
  price_type: string;
};

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchCustomers(): Promise<CustomerListRow[]> {
  const res = await fetch("/api/customers", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  const body = (await res.json()) as { customers: CustomerListRow[] };
  return body.customers ?? [];
}

export async function fetchPosCustomers(): Promise<PosCustomer[]> {
  const res = await fetch("/api/customers/pos", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  const body = (await res.json()) as { customers: PosCustomer[] };
  return body.customers ?? [];
}

export async function fetchCustomersWithBalance(): Promise<CustomerBalanceRow[]> {
  const res = await fetch("/api/customers/credit-balances", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  const body = (await res.json()) as { customers: CustomerBalanceRow[] };
  return body.customers ?? [];
}

export type CreateCustomerParams = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customerType?: "retail" | "wholesale" | "trade" | "contractor" | "vip";
  creditLimit?: number;
  creditDays?: number;
  priceType?: "retail" | "wholesale" | "trade" | "vip";
  openingCredit?: number;
  openingDeposit?: number;
};

export async function createCustomerApi(
  params: CreateCustomerParams
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("/api/customers/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let body: { ok: true; id: string } | { ok: false; message?: string; error?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: res.statusText || "Create failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        ("message" in body && body.message) ||
        ("error" in body && body.error) ||
        res.statusText ||
        "Create failed",
    };
  }
  if (body.ok && "id" in body) return { ok: true, id: body.id };
  return {
    ok: false,
    message: ("message" in body && body.message) || "Create failed",
  };
}

export const CUSTOMER_QUERY_KEYS = [
  "customers",
  "pos-customers",
  "credit-balances",
] as const;

export async function recordCustomerDepositApi(
  params: Parameters<
    typeof import("@/lib/actions/customers").recordCustomerDeposit
  >[0]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/customers/deposit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let body: { ok: true } | { ok: false; message?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: res.statusText || "Deposit failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        ("message" in body && body.message) || "Deposit failed",
    };
  }
  if (body.ok) return { ok: true };
  return {
    ok: false,
    message: ("message" in body && body.message) || "Deposit failed",
  };
}

export function invalidateCustomerQueries(
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void }
) {
  for (const key of CUSTOMER_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
