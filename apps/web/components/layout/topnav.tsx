"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Boxes,
  LogOut,
  Menu,
  Moon,
  Sun,
  UserCog,
  CreditCard,
  Shield,
} from "lucide-react";
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
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { initials } from "@/lib/utils";
import { mainNav, adminNav } from "./nav-config";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export function TopNav() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, logout, isAdmin } = useAuthStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar}>
        <Menu className="size-5" />
      </Button>

      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
          <Boxes className="size-3.5" />
        </div>
        <span className="font-semibold">{BRAND}</span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

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
                <Shield className="size-4" /> Admin panel
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
  const adminVisible = useAuthStore((s) => s.isAdmin());
  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-2 py-2 md:hidden">
      {[...mainNav, ...(adminVisible ? adminNav : [])].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
