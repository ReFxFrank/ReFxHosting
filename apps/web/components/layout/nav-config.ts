import {
  LayoutDashboard,
  Server,
  CreditCard,
  LifeBuoy,
  UserCog,
  ShoppingCart,
  Shield,
  ServerCog,
  type LucideIcon,
} from "lucide-react";
import type { GlobalRole } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: GlobalRole[];
}

export const mainNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Servers", href: "/servers", icon: Server },
  { label: "Order", href: "/order", icon: ShoppingCart },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Account", href: "/account", icon: UserCog },
];

export const adminNav: NavItem[] = [
  { label: "Admin", href: "/admin", icon: Shield, roles: ["ADMIN", "OWNER"] },
  { label: "Servers", href: "/admin/servers", icon: ServerCog, roles: ["ADMIN", "OWNER"] },
];

export const serverTabs = (id: string) => [
  { label: "Console", href: `/servers/${id}/console` },
  { label: "Files", href: `/servers/${id}/files` },
  { label: "Databases", href: `/servers/${id}/databases` },
  { label: "Backups", href: `/servers/${id}/backups` },
  { label: "Schedules", href: `/servers/${id}/schedules` },
  { label: "Switch Game", href: `/servers/${id}/switch-game` },
  { label: "Upgrade", href: `/servers/${id}/upgrade` },
  { label: "Settings", href: `/servers/${id}/settings` },
];
