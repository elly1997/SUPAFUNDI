import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  ClipboardList,
  CreditCard,
  FileText,
  FileStack,
  Landmark,
  Truck,
  LayoutDashboard,
  Package,
  PackagePlus,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  History,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import type { UserRole } from "@/lib/auth/roles";
import {
  canManageSettings,
  canUsePos,
  canViewFinance,
  canViewReports,
} from "@/lib/auth/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
};

export type NavSection = {
  id: string;
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  items: NavItem[];
};

/** Top-level horizontal tabs (module navigation). */
export const PRIMARY_NAV_TABS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "POS",
    href: "/pos",
    icon: ShoppingCart,
    roles: ["owner", "manager", "cashier", "sales_rep"],
  },
  { label: "Sales", href: "/sales", icon: Receipt },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  {
    label: "Purchase orders",
    href: "/inventory/purchase-orders",
    icon: ClipboardList,
    roles: ["owner", "manager", "accountant"],
  },
  { label: "Products", href: "/inventory/products", icon: Package },
  { label: "Stock", href: "/inventory/stock", icon: Warehouse },
  { label: "Customers", href: "/customers", icon: Users },
  {
    label: "Cash drawer",
    href: "/finance/cash-sessions",
    icon: Wallet,
    roles: ["owner", "manager", "cashier", "accountant"],
  },
  {
    label: "Expenses",
    href: "/finance/expenses",
    icon: Banknote,
    roles: ["owner", "manager", "accountant"],
  },
  {
    label: "Credit",
    href: "/finance/credit",
    icon: CreditCard,
    roles: ["owner", "manager", "accountant"],
  },
  {
    label: "Payables",
    href: "/finance/payables",
    icon: FileStack,
    roles: ["owner", "manager", "accountant"],
  },
  {
    label: "Banking",
    href: "/finance/banking",
    icon: Landmark,
    roles: ["owner", "manager", "accountant"],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: Boxes,
    roles: ["owner", "manager", "accountant", "sales_rep", "viewer"],
  },
  {
    label: "Settings",
    href: "/settings/general",
    icon: Settings,
    roles: ["owner", "manager"],
  },
];

export function filterPrimaryNavForRole(role: UserRole): NavItem[] {
  return PRIMARY_NAV_TABS.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    title: "Overview",
    defaultOpen: true,
    items: [
      { label: "Daily closing", href: "/daily-closing", icon: Sun },
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    id: "operations",
    items: [
      {
        label: "POS Terminal",
        href: "/pos",
        icon: ShoppingCart,
        roles: ["owner", "manager", "cashier", "sales_rep"],
      },
    ],
  },
  {
    id: "sales",
    title: "Sales",
    defaultOpen: true,
    items: [
      { label: "Sales list", href: "/sales", icon: Receipt },
      { label: "Invoices & quotes", href: "/invoices", icon: FileText },
    ],
  },
  {
    id: "suppliers",
    title: "Suppliers",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Truck },
      {
        label: "Purchase orders",
        href: "/inventory/purchase-orders",
        icon: ClipboardList,
        roles: ["owner", "manager", "accountant"],
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    collapsible: true,
    defaultOpen: true,
    items: [
      { label: "Products", href: "/inventory/products", icon: Package },
      { label: "Stock", href: "/inventory/stock", icon: Warehouse },
      {
        label: "Catch-up",
        href: "/inventory/catch-up",
        icon: History,
        roles: ["owner", "manager", "accountant"],
      },
      { label: "Receive goods", href: "/inventory/receive", icon: PackagePlus },
      { label: "Supplier returns", href: "/inventory/returns", icon: ArrowLeftRight },
      { label: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    items: [{ label: "Customers", href: "/customers", icon: Users }],
  },
  {
    id: "money",
    title: "Money",
    collapsible: true,
    defaultOpen: false,
    items: [
      {
        label: "Cash drawer",
        href: "/finance/cash-sessions",
        icon: Wallet,
        roles: ["owner", "manager", "cashier", "accountant"],
      },
      {
        label: "Expenses",
        href: "/finance/expenses",
        icon: Banknote,
        roles: ["owner", "manager", "accountant"],
      },
      {
        label: "Credit / AR",
        href: "/finance/credit",
        icon: CreditCard,
        roles: ["owner", "manager", "accountant"],
      },
      {
        label: "Payables",
        href: "/finance/payables",
        icon: FileStack,
        roles: ["owner", "manager", "accountant"],
      },
      {
        label: "Banking",
        href: "/finance/banking",
        icon: Landmark,
        roles: ["owner", "manager", "accountant"],
      },
    ],
  },
  {
    id: "insights",
    title: "Insights",
    items: [
      {
        label: "Reports",
        href: "/reports",
        icon: Boxes,
        roles: ["owner", "manager", "accountant", "sales_rep", "viewer"],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    collapsible: true,
    defaultOpen: false,
    items: [
      {
        label: "General",
        href: "/settings/general",
        icon: Settings,
        roles: ["owner", "manager"],
      },
      {
        label: "Outlets",
        href: "/settings/outlets",
        icon: Store,
        roles: ["owner", "manager"],
      },
      {
        label: "Users",
        href: "/settings/users",
        icon: Users,
        roles: ["owner", "manager"],
      },
    ],
  },
];

export function filterNavForRole(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(role);
    }),
  })).filter((section) => section.items.length > 0);
}

export function canSeeNavItem(item: NavItem, role: UserRole): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role);
}

export function roleCanUsePos(role: UserRole): boolean {
  return canUsePos(role);
}

export function roleCanViewFinance(role: UserRole): boolean {
  return canViewFinance(role);
}

export function roleCanViewReports(role: UserRole): boolean {
  return canViewReports(role);
}

export function roleCanManageSettings(role: UserRole): boolean {
  return canManageSettings(role);
}

/** True if pathname matches this nav item (including child routes). */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/settings/general") {
    return pathname.startsWith("/settings");
  }
  if (href === "/invoices") {
    return pathname.startsWith("/invoices");
  }
  if (href === "/suppliers") {
    return pathname.startsWith("/suppliers");
  }
  if (href === "/inventory/purchase-orders") {
    return pathname.startsWith("/inventory/purchase-orders");
  }
  if (href === "/inventory/products") {
    return (
      pathname.startsWith("/inventory") &&
      !pathname.startsWith("/inventory/purchase-orders") &&
      !pathname.startsWith("/inventory/returns")
    );
  }
  if (href.startsWith("/finance/")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True if any item in the section is active. */
export function isNavSectionActive(
  pathname: string,
  items: NavItem[]
): boolean {
  return items.some((item) => isNavItemActive(pathname, item.href));
}
