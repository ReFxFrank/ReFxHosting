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
  Siren,
  Bell,
  ScrollText,
  Settings,
  ReceiptText,
  Wallet,
  TicketPercent,
  Gift,
  ShieldCheck,
  Database,
  TrendingUp,
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
  {
    items: [
      {
        label: "Overview",
        href: "/admin",
        icon: LayoutDashboard,
        perm: "dashboard.read",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Servers",
        href: "/admin/servers",
        icon: ServerCog,
        perm: "servers.read",
      },
      { label: "Nodes", href: "/admin/nodes", icon: Boxes, perm: "nodes.read" },
      {
        label: "Database Hosts",
        href: "/admin/database-hosts",
        icon: Database,
        perm: "nodes.read",
      },
      {
        label: "Locations",
        href: "/admin/locations",
        icon: MapPin,
        perm: "locations.manage",
      },
    ],
  },
  {
    title: "Customers & Billing",
    items: [
      {
        label: "Customers",
        href: "/admin/customers",
        icon: Users,
        perm: "users.read",
      },
      {
        label: "Users",
        href: "/admin/users",
        icon: UserCog,
        perm: "users.read",
      },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ShoppingCart,
        perm: "billing.read",
      },
      {
        label: "Invoices",
        href: "/admin/invoices",
        icon: ReceiptText,
        perm: "billing.read",
      },
      {
        label: "Billing",
        href: "/admin/billing",
        icon: CreditCard,
        perm: "billing.read",
      },
      {
        label: "Growth",
        href: "/admin/growth",
        icon: TrendingUp,
        perm: "billing.read",
      },
      {
        label: "Payments",
        href: "/admin/payments",
        icon: Wallet,
        perm: "payments.manage",
      },
      {
        label: "Coupons",
        href: "/admin/coupons",
        icon: TicketPercent,
        perm: "billing.manage",
      },
      {
        label: "Gift cards",
        href: "/admin/gift-cards",
        icon: Gift,
        perm: "billing.manage",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        label: "Tickets",
        href: "/admin/support",
        icon: LifeBuoy,
        perm: "support.read",
      },
    ],
  },
  {
    title: "Catalog",
    items: [
      {
        label: "Products",
        href: "/admin/products",
        icon: Package,
        perm: "catalog.read",
      },
      {
        label: "Eggs",
        href: "/admin/templates",
        icon: Egg,
        perm: "catalog.read",
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        label: "Homepage Alerts",
        href: "/admin/homepage-alerts",
        icon: Megaphone,
        perm: "content.read",
      },
      {
        label: "Status Incidents",
        href: "/admin/incidents",
        icon: Siren,
        perm: "content.read",
      },
      {
        label: "Alerts",
        href: "/admin/alerts",
        icon: Bell,
        perm: "content.read",
      },
      {
        label: "Staff",
        href: "/admin/staff",
        icon: Users,
        perm: "content.read",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Roles & Permissions",
        href: "/admin/roles",
        icon: ShieldCheck,
        perm: "roles.manage",
      },
      {
        label: "Audit Logs",
        href: "/admin/audit",
        icon: ScrollText,
        perm: "audit.read",
      },
      {
        label: "Settings",
        href: "/admin/settings",
        icon: Settings,
        perm: "settings.manage",
      },
    ],
  },
];

/** Flattened admin items (for active-route matching / mobile nav). */
export const adminNavItems: NavItem[] = adminNav.flatMap((s) => s.items);

/** A tab on the server detail screen. `perm` is the per-server permission a
 * sub-user must hold to see it (owners/staff hold the full catalog). Omitted =
 * always visible (baseline `server.read`, which every member has). The panel
 * enforces the same permission on every underlying request, so hiding a tab is
 * a UX affordance, not the security boundary. */
export interface ServerTab {
  label: string;
  href: string;
  perm?: string;
}

export const serverTabs = (id: string): ServerTab[] => [
  { label: "Console", href: `/servers/${id}/console`, perm: "console.read" },
  { label: "Files", href: `/servers/${id}/files`, perm: "files.read" },
  {
    label: "Databases",
    href: `/servers/${id}/databases`,
    perm: "database.read",
  },
  { label: "Backups", href: `/servers/${id}/backups`, perm: "backup.read" },
  {
    label: "Schedules",
    href: `/servers/${id}/schedules`,
    perm: "schedule.read",
  },
  { label: "Minecraft", href: `/servers/${id}/minecraft`, perm: "files.read" },
  { label: "Mods", href: `/servers/${id}/mods`, perm: "files.read" },
  { label: "Modpacks", href: `/servers/${id}/modpacks`, perm: "files.read" },
  { label: "Workshop", href: `/servers/${id}/workshop`, perm: "files.read" },
  { label: "Voice", href: `/servers/${id}/voice` },
  { label: "Domains", href: `/servers/${id}/domains`, perm: "settings.read" },
  {
    label: "Switch Game",
    href: `/servers/${id}/switch-game`,
    perm: "control.switch-game",
  },
  { label: "Upgrade", href: `/servers/${id}/upgrade`, perm: "control.resize" },
  { label: "Settings", href: `/servers/${id}/settings`, perm: "settings.read" },
];
