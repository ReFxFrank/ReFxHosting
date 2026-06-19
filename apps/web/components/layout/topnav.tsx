"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Menu,
  UserCog,
  CreditCard,
  Shield,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationsBell } from "./notifications-bell";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { initials } from "@/lib/utils";
import { customerNav } from "./nav-config";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export function TopNav() {
  const router = useRouter();
  const { user, logout, isAdmin } = useAuthStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="refx-beam sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[rgba(7,13,24,0.7)] px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-[rgba(7,13,24,0.55)]">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar}>
        <Menu className="size-5" />
      </Button>

      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <LogoMark size={24} />
        <span className="font-semibold tracking-tight">{BRAND}</span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <NotificationsBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="size-8">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                <AvatarFallback>{initials(user?.firstName, user?.email)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/account")}>
              <UserCog className="size-4" /> Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/billing")}>
              <CreditCard className="size-4" /> Billing
            </DropdownMenuItem>
            {isAdmin() && (
              <DropdownMenuItem onClick={() => router.push("/admin")}>
                <Shield className="size-4" /> Staff panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={handleLogout}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function MobileNav() {
  // Lightweight mobile drawer-less nav rendered below topnav on small screens.
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.06] bg-[rgba(7,13,24,0.5)] px-2 py-2 backdrop-blur md:hidden">
      {customerNav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-foreground"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
