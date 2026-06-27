import { canViewFinance, isUserRole, type UserRole } from "@/lib/auth/roles";

export function canSendCustomerSms(role: string | null): boolean {
  const parsed: UserRole | null =
    role && isUserRole(role) ? role : null;
  return canViewFinance(parsed);
}
