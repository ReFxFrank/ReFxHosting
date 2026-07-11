// UI preferences: sidebar collapse state, persisted to localStorage.
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebar: (collapsed: boolean) => void;
  /** Mobile nav drawer (the sidebar is display:none below md). Not persisted. */
  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebar: (collapsed) => set({ sidebarCollapsed: collapsed }),
      mobileNavOpen: false,
      setMobileNav: (open) => set({ mobileNavOpen: open }),
    }),
    {
      name: "refx.ui",
      // Only the desktop collapse preference persists; the drawer is ephemeral.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
