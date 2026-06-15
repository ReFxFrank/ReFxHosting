"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Menu, Moon, Sun, UserCog, ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { adminNavItems } from "./nav-config";

export function AdminTopNav() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const roleLabel = user?.globalRole === "OWNER" ? "Owner" : "Admin";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[rgba(5,8,16,0.8)] px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-[rgba(5,8,16,0.6)]">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar}>
        <Menu className="size-5" />
      </Button>

      <Link href="/admin" className="flex items-center gap-2 md:hidden">
        <ShieldCheck className="size-5 text-[hsl(var(--primary))]" />
        <span className="font-semibold tracking-tight">Staff Panel</span>
      </Link>

      <Badge
        variant="outline"
        className="hidden border-primary/40 bg-primary/10 text-[hsl(var(--primary))] sm:inline-flex"
      >
        <ShieldCheck className="size-3.5" /> {roleLabel}
      </Badge>

      <div className="ml-auto flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link href="/dashboard">
            <ArrowLeft className="size-4" /> Client area
          </Link>
        </Button>

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
              <UserCog className="size-4" /> My account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="size-4" /> Exit to client area
            </DropdownMenuItem>
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

export function AdminMobileNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.08] bg-[rgba(5,8,16,0.6)] px-2 py-2 backdrop-blur md:hidden">
      {adminNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-foreground"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
