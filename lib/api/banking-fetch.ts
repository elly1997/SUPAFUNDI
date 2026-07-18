import type {
  BankTransactionRow,
  PaymentAccountRow,
} from "@/lib/actions/banking";

export async function fetchPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const res = await fetch("/api/finance/banking/accounts", {
    credentials: "include",
  });
  const body = (await res.json()) as {
    accounts?: PaymentAccountRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load accounts");
  }
  return body.accounts ?? [];
}

export async function fetchBankTransactions(
  accountId: string | null,
  outletId?: string | null
): Promise<BankTransactionRow[]> {
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", accountId);
  if (outletId) params.set("outletId", outletId);
  const qs = params.toString();
  const res = await fetch(
    `/api/finance/banking/transactions${qs ? `?${qs}` : ""}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    transactions?: BankTransactionRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load transactions");
  }
  return body.transactions ?? [];
}

export async function recordCashDepositApi(params: {
  bankAccountId: string;
  amount: number;
  outletId: string;
  businessDate: string;
  description?: string;
  referenceNo?: string;
}): Promise<
  { ok: true; transactionId: string } | { ok: false; message: string }
> {
  const res = await fetch("/api/finance/banking/cash-deposit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      message:
        (body as { message?: string }).message ??
        (body as { error?: string }).error ??
        "Deposit failed",
    };
  }
  return body as { ok: true; transactionId: string } | { ok: false; message: string };
}

export async function fetchPosPaymentAccounts(
  posMethod: "mpesa" | "bank_transfer" | "card"
): Promise<PaymentAccountRow[]> {
  const res = await fetch(
    `/api/finance/banking/pos-accounts?method=${posMethod}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    accounts?: PaymentAccountRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load POS accounts");
  }
  return body.accounts ?? [];
}

export async function fetchCashDepositAccounts(): Promise<PaymentAccountRow[]> {
  const res = await fetch("/api/finance/banking/deposit-accounts", {
    credentials: "include",
  });
  const body = (await res.json()) as {
    accounts?: PaymentAccountRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load bank accounts");
  }
  return body.accounts ?? [];
}

export async function reverseBankTransactionApi(
  transactionId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/finance/banking/reverse-transaction", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId }),
  });
  const body = (await res.json()) as
    | { ok: true }
    | { ok: false; message?: string };
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      message:
        body.ok === false
          ? body.message ?? "Reversal failed"
          : "Reversal failed",
    };
  }
  return { ok: true };
}

export async function adjustAccountBalanceApi(params: {
  bankAccountId: string;
  newBalance: number;
  reason: string;
  adminPassword: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/finance/banking/adjust-balance", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as
    | { ok: true }
    | { ok: false; message?: string };
  if (!res.ok) {
    return {
      ok: false,
      message:
        body.ok === false ? body.message ?? "Adjustment failed" : "Adjustment failed",
    };
  }
  return body.ok
    ? { ok: true }
    : { ok: false, message: body.message ?? "Adjustment failed" };
}
