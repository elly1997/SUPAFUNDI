export type PaymentAccountType = "bank" | "mpesa" | "lipa" | "till";

export const PAYMENT_ACCOUNT_TYPES: {
  value: PaymentAccountType;
  label: string;
  hint: string;
}[] = [
  {
    value: "bank",
    label: "Bank account",
    hint: "Used when customers pay via bank transfer on POS",
  },
  {
    value: "mpesa",
    label: "M-Pesa",
    hint: "Business M-Pesa wallet or paybill",
  },
  {
    value: "lipa",
    label: "Lipa number",
    hint: "Lipa / merchant till (e.g. Vodacom Lipa)",
  },
  {
    value: "till",
    label: "Till / Paybill",
    hint: "Till or paybill number for collections",
  },
];

export function paymentAccountTypeLabel(type: PaymentAccountType): string {
  return PAYMENT_ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function defaultPosMethodForAccountType(
  type: PaymentAccountType
): "mpesa" | "bank_transfer" | "card" | null {
  if (type === "bank") return "bank_transfer";
  if (type === "mpesa" || type === "lipa" || type === "till") return "mpesa";
  return null;
}

export function formatAccountDetails(row: {
  account_type: PaymentAccountType;
  bank_name: string | null;
  account_no: string | null;
  lipa_merchant: string | null;
}): string {
  const parts: string[] = [];
  if (row.account_type === "bank") {
    if (row.bank_name) parts.push(row.bank_name);
    if (row.account_no) parts.push(row.account_no);
  } else if (row.account_type === "lipa") {
    if (row.lipa_merchant) parts.push(row.lipa_merchant);
    if (row.account_no) parts.push(`Lipa ${row.account_no}`);
  } else {
    if (row.account_no) parts.push(row.account_no);
    if (row.bank_name) parts.push(row.bank_name);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}
