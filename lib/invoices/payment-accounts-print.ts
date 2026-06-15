import { listPaymentAccounts } from "@/lib/actions/banking";
import {
  formatAccountDetails,
  paymentAccountTypeLabel,
  type PaymentAccountType,
} from "@/lib/constants/payment-accounts";
import type { PaymentAccountPrintLine } from "@/lib/invoices/print-data";

export async function loadPaymentAccountsForPrint(): Promise<
  PaymentAccountPrintLine[]
> {
  const accounts = await listPaymentAccounts();
  return accounts
    .filter((a) => a.is_active)
    .map((a) => ({
      name: a.name,
      typeLabel: paymentAccountTypeLabel(a.account_type as PaymentAccountType),
      details: formatAccountDetails({
        account_type: a.account_type as PaymentAccountType,
        bank_name: a.bank_name,
        account_no: a.account_no,
        lipa_merchant: a.lipa_merchant,
      }),
    }));
}
