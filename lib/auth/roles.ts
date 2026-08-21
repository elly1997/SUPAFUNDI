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

/** Owners and managers may invite or edit team members. */
export function canInviteUsers(role: UserRole | null): boolean {
  return canManageSettings(role);
}

/** Owners and managers may approve inter-outlet stock transfers. */
export function canApproveStockTransfers(role: UserRole | null): boolean {
  return canManageSettings(role);
}

/** Inbox (approvals + reconciliations) is owner/manager only. */
export function canAccessInbox(role: UserRole | null): boolean {
  return canManageSettings(role);
}

/** Counter staff may ask to void a receipt; owners/managers approve or void. */
export function canRequestSaleVoid(role: UserRole | null): boolean {
  return role === "cashier" || role === "sales_rep";
}

/** Only owners may assign or change the owner role. */
export function canAssignOwnerRole(role: UserRole | null): boolean {
  return role === "owner";
}

/** Only owners may assign staff to outlets and set their login password. */
export function canAssignOutletAccess(role: UserRole | null): boolean {
  return role === "owner";
}

/** Only owners may change the active working outlet in the header/POS. */
export function canSwitchOutlets(role: UserRole | null): boolean {
  return role === "owner";
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
