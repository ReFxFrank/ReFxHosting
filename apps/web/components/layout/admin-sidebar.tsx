"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { adminNav, type NavItem } from "./nav-config";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

/** Exact-match for the overview route, prefix-match for everything else, so
 *  `/admin` doesn't stay highlighted while on `/admin/nodes`. */
function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function AdminNavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
        active
          ? "border border-primary/30 bg-primary/15 text-foreground shadow-[0_0_18px_-8px_hsl(var(--primary)/0.8)]"
          : "border border-transparent text-sidebar-foreground hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_10px_0_hsl(var(--primary)/0.9)]" />
      )}
      <Icon className={cn("size-[18px] shrink-0", active && "text-[hsl(var(--primary))]")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

export function AdminSidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const hasRole = useAuthStore((s) => s.hasRole);

  // Role-gate items (e.g. Payments is OWNER-only). The server also enforces this,
  // so hidden items aren't reachable even by URL/API.
  const sections = adminNav
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => !i.roles || hasRole(...i.roles)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,12,22,0.98),rgba(5,8,16,0.98))] transition-all duration-200 md:flex",
        sidebarCollapsed ? "w-[64px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 border-b border-white/[0.08] px-4",
          sidebarCollapsed && "justify-center px-2",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/20 text-[hsl(var(--primary))] ring-1 ring-primary/30">
          <ShieldCheck className="size-4" />
        </span>
        {!sidebarCollapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {BRAND}
            </span>
            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--primary))]">
              Staff Panel
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <div key={section.title ?? `s${i}`} className="space-y-1">
            {section.title && !sidebarCollapsed && (
              <div className="px-3 pb-0.5 pt-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                {section.title}
              </div>
            )}
            {section.items.map((item) => (
              <AdminNavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/[0.08] p-2">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground",
            sidebarCollapsed && "justify-center px-2",
          )}
        >
          <ArrowLeft className="size-4 shrink-0" />
          {!sidebarCollapsed && <span>Client area</span>}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-muted-foreground"
          onClick={toggleSidebar}
        >
          <ChevronLeft className={cn("size-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          {!sidebarCollapsed && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}
