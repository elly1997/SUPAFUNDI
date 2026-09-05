import type { EmployeeRow } from "@/lib/actions/employees";
import type { PayrollRunDetail } from "@/lib/actions/payroll";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchEmployees(): Promise<EmployeeRow[]> {
  const res = await fetch("/api/payroll/employees", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { employees: EmployeeRow[] };
  return body.employees ?? [];
}

export async function createEmployeeApi(input: {
  fullName: string;
  phone?: string;
  jobTitle?: string;
  grossMonthlySalary: number;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("/api/payroll/employees", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<
    { ok: true; id: string } | { ok: false; message: string }
  >;
}

export async function updateEmployeeApi(
  id: string,
  input: {
    fullName: string;
    phone?: string;
    jobTitle?: string;
    grossMonthlySalary: number;
    isActive?: boolean;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/payroll/employees/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<{ ok: true } | { ok: false; message: string }>;
}

export async function importEmployeesFromProfilesApi(): Promise<
  { ok: true; imported: number } | { ok: false; message: string }
> {
  const res = await fetch("/api/payroll/employees/import-profiles", {
    method: "POST",
    credentials: "include",
  });
  return res.json() as Promise<
    { ok: true; imported: number } | { ok: false; message: string }
  >;
}

export async function fetchPayrollRun(
  payrollMonth: string
): Promise<PayrollRunDetail | null> {
  const q = new URLSearchParams({ month: payrollMonth });
  const res = await fetch(`/api/payroll/run?${q}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { run: PayrollRunDetail | null };
  return body.run;
}

export async function refreshPayrollRunApi(
  payrollMonth: string
): Promise<
  | { ok: true; run: PayrollRunDetail; warnings?: string[] }
  | { ok: false; message: string }
> {
  const res = await fetch("/api/payroll/run", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payrollMonth }),
  });
  return res.json() as Promise<
    | { ok: true; run: PayrollRunDetail; warnings?: string[] }
    | { ok: false; message: string }
  >;
}

export async function recordEmployeeBonusApi(input: {
  employeeId: string;
  amount: number;
  bonusDate: string;
  description?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/payroll/bonus", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<{ ok: true } | { ok: false; message: string }>;
}

export async function closePayrollRunApi(input: {
  payrollMonth: string;
  lines: {
    lineId: string;
    paymentMethod: "cash" | "mpesa" | "bank_transfer";
    bankAccountId?: string;
    referenceNo?: string;
  }[];
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/payroll/close", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<{ ok: true } | { ok: false; message: string }>;
}
