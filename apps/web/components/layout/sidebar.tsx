"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import { customerNav, type NavItem } from "./nav-config";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
        active
          ? "border border-primary/25 bg-primary/15 text-[hsl(214_100%_85%)] shadow-[0_0_18px_-8px_rgba(0,114,255,0.7)]"
          : "border border-transparent text-sidebar-foreground hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_10px_0_rgba(0,114,255,0.8)]" />
      )}
      <Icon className={cn("size-[18px] shrink-0", active && "text-[hsl(213_100%_70%)]")} />
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

  return (
    <aside
      className={cn(
        "refx-beam sticky top-0 hidden h-svh shrink-0 flex-col border-r border-white/[0.06] bg-[linear-gradient(180deg,rgba(10,18,32,0.96),rgba(7,13,24,0.96))] transition-all duration-200 md:flex",
        sidebarCollapsed ? "w-[64px]" : "w-60",
      )}
    >
      <Link
        href="/"
        aria-label={`${BRAND} — home`}
        className={cn(
          "flex h-14 items-center gap-2 border-b border-white/[0.06] px-4 transition-opacity hover:opacity-80",
          sidebarCollapsed && "justify-center px-2",
        )}
      >
        <LogoMark size={28} />
        {!sidebarCollapsed && (
          <span className="truncate font-semibold tracking-tight text-[hsl(213_100%_97%)]">
            {BRAND}
          </span>
        )}
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {customerNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-2">
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

/**
 * Mobile drawer variant. The desktop <Sidebar> is display:none below md and
 * only collapses; this is what the top-bar hamburger actually opens on a
 * phone. Closes on backdrop tap, the X, or any navigation.
 */
export function MobileSidebar() {
  const { mobileNavOpen, setMobileNav } = useUiStore();
  const pathname = usePathname();

  // Navigating (tapping a link) closes the drawer.
  useEffect(() => {
    setMobileNav(false);
  }, [pathname, setMobileNav]);

  if (!mobileNavOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        aria-label="Close menu"
        className="absolute inset-0 bg-black/60"
        onClick={() => setMobileNav(false)}
      />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,18,32,0.99),rgba(7,13,24,0.99))] shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4">
          <span className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="truncate font-semibold tracking-tight text-[hsl(213_100%_97%)]">
              {BRAND}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          >
            <X className="size-5" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {customerNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed={false} />
          ))}
        </nav>
      </aside>
    </div>
  );
}
