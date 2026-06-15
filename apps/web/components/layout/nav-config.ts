import {
  LayoutDashboard,
  Server,
  CreditCard,
  LifeBuoy,
  UserCog,
  ShoppingCart,
  ServerCog,
  Boxes,
  MapPin,
  Users,
  Package,
  Egg,
  Megaphone,
  Bell,
  ScrollText,
  Settings,
  ReceiptText,
  Wallet,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { GlobalRole } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Minimum roles allowed to see this item (admin area only). Omitted = all staff. */
  roles?: GlobalRole[];
}

/** A titled group of nav items (used by the admin sidebar). */
export interface NavSection {
  title?: string;
  items: NavItem[];
}

// ---- Customer area -------------------------------------------------------
// Strictly client-facing. No admin/system links ever appear here.
export const customerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Servers", href: "/servers", icon: Server },
  { label: "Order", href: "/order", icon: ShoppingCart },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Account", href: "/account", icon: UserCog },
];

// ---- Admin / Staff area --------------------------------------------------
// Each major section is a direct route. The whole /admin surface is gated to
// ADMIN/OWNER on the client (AdminLayout guard) AND server-side (RolesGuard on
// the admin controller), so these are not security-by-hiding.
// Role gating: items with no `roles` are visible to all staff incl. SUPPORT
// (a read-only tier). ADMIN-only items carry roles: ["ADMIN"]; Payments is OWNER.
// The server enforces the same boundaries, so this isn't security-by-hiding.
export const adminNav: NavSection[] = [
  { items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard }] },
  {
    title: "Operations",
    items: [
      { label: "Servers", href: "/admin/servers", icon: ServerCog },
      { label: "Nodes", href: "/admin/nodes", icon: Boxes, roles: ["ADMIN"] },
      { label: "Locations", href: "/admin/locations", icon: MapPin, roles: ["ADMIN"] },
    ],
  },
  {
    title: "Customers & Billing",
    items: [
      { label: "Customers", href: "/admin/customers", icon: Users },
      { label: "Users", href: "/admin/users", icon: UserCog },
      { label: "Orders", href: "/admin/orders", icon: ShoppingCart, roles: ["ADMIN"] },
      { label: "Invoices", href: "/admin/invoices", icon: ReceiptText, roles: ["ADMIN"] },
      { label: "Billing", href: "/admin/billing", icon: CreditCard, roles: ["ADMIN"] },
      { label: "Payments", href: "/admin/payments", icon: Wallet, roles: ["OWNER"] },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/admin/products", icon: Package, roles: ["ADMIN"] },
      { label: "Eggs", href: "/admin/templates", icon: Egg, roles: ["ADMIN"] },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Homepage Alerts", href: "/admin/homepage-alerts", icon: Megaphone, roles: ["ADMIN"] },
      { label: "Alerts", href: "/admin/alerts", icon: Bell, roles: ["ADMIN"] },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck, roles: ["OWNER"] },
      { label: "Audit Logs", href: "/admin/audit", icon: ScrollText, roles: ["ADMIN"] },
      { label: "Settings", href: "/admin/settings", icon: Settings, roles: ["ADMIN"] },
    ],
  },
];

/** Flattened admin items (for active-route matching / mobile nav). */
export const adminNavItems: NavItem[] = adminNav.flatMap((s) => s.items);

export const serverTabs = (id: string) => [
  { label: "Console", href: `/servers/${id}/console` },
  { label: "Files", href: `/servers/${id}/files` },
  { label: "Databases", href: `/servers/${id}/databases` },
  { label: "Backups", href: `/servers/${id}/backups` },
  { label: "Schedules", href: `/servers/${id}/schedules` },
  { label: "Minecraft", href: `/servers/${id}/minecraft` },
  { label: "Mods", href: `/servers/${id}/mods` },
  { label: "Switch Game", href: `/servers/${id}/switch-game` },
  { label: "Upgrade", href: `/servers/${id}/upgrade` },
  { label: "Settings", href: `/servers/${id}/settings` },
];
