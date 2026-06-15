"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { mainNav, adminNav, type NavItem } from "./nav-config";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
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

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const isAdmin = useAuthStore((s) => s.user?.globalRole === "ADMIN" || s.user?.globalRole === "OWNER");

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar transition-all duration-200 md:flex",
        sidebarCollapsed ? "w-[64px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b px-4",
          sidebarCollapsed && "justify-center px-2",
        )}
      >
        <LogoMark size={28} />
        {!sidebarCollapsed && <span className="truncate font-semibold">{BRAND}</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
        ))}
        {isAdmin && (
          <>
            <div className={cn("my-2 px-3 text-xs font-medium uppercase text-muted-foreground", sidebarCollapsed && "hidden")}>
              Administration
            </div>
            {adminNav.map((item) => (
              <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t p-2">
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
