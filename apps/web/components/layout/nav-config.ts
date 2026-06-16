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

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Admin permission required to see this item (server-enforced too). */
  perm?: string;
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
// Each item declares the admin permission it needs; the sidebar hides items the
// staff member lacks. The server enforces the same permission on every request,
// so this is not security-by-hiding.
export const adminNav: NavSection[] = [
  { items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard, perm: "dashboard.read" }] },
  {
    title: "Operations",
    items: [
      { label: "Servers", href: "/admin/servers", icon: ServerCog, perm: "servers.read" },
      { label: "Nodes", href: "/admin/nodes", icon: Boxes, perm: "nodes.read" },
      { label: "Locations", href: "/admin/locations", icon: MapPin, perm: "locations.manage" },
    ],
  },
  {
    title: "Customers & Billing",
    items: [
      { label: "Customers", href: "/admin/customers", icon: Users, perm: "users.read" },
      { label: "Users", href: "/admin/users", icon: UserCog, perm: "users.read" },
      { label: "Orders", href: "/admin/orders", icon: ShoppingCart, perm: "billing.read" },
      { label: "Invoices", href: "/admin/invoices", icon: ReceiptText, perm: "billing.read" },
      { label: "Billing", href: "/admin/billing", icon: CreditCard, perm: "billing.read" },
      { label: "Payments", href: "/admin/payments", icon: Wallet, perm: "payments.manage" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Tickets", href: "/admin/support", icon: LifeBuoy, perm: "support.read" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/admin/products", icon: Package, perm: "catalog.manage" },
      { label: "Eggs", href: "/admin/templates", icon: Egg, perm: "catalog.manage" },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Homepage Alerts", href: "/admin/homepage-alerts", icon: Megaphone, perm: "content.manage" },
      { label: "Alerts", href: "/admin/alerts", icon: Bell, perm: "content.manage" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck, perm: "roles.manage" },
      { label: "Audit Logs", href: "/admin/audit", icon: ScrollText, perm: "audit.read" },
      { label: "Settings", href: "/admin/settings", icon: Settings, perm: "settings.manage" },
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
