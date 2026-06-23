export const USER_ROLES = [
  "owner",
  "manager",
  "cashier",
  "accountant",
  "sales_rep",
  "viewer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function canManageSettings(role: UserRole | null): boolean {
  return role === "owner" || role === "manager";
}

export function canManageUsers(role: UserRole | null): boolean {
  return role === "owner" || role === "manager";
}

export function canUsePos(role: UserRole | null): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "cashier" ||
    role === "sales_rep"
  );
}

/** Managers/owners may complete sales without an open cash drawer. */
export function canBypassCashSession(role: UserRole | null): boolean {
  return role === "owner" || role === "manager";
}

export function canViewFinance(role: UserRole | null): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "accountant"
  );
}

export function canViewReports(role: UserRole | null): boolean {
  return role !== "cashier" && role !== null;
}

/** Default route after login — POS for counter staff, reports for back-office viewers. */
export function getDefaultLandingPath(role: UserRole | null): string {
  if (canUsePos(role)) return "/pos";
  if (canViewReports(role)) return "/reports";
  return "/sales";
}
