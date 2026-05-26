// Lightweight global open/close for the AuthScreen modal. The component
// itself lives at the top of AppShell so any feature CTA (HighlightPopover,
// notes editor, library creator) can open it without prop-drilling.

import { create } from "zustand";

interface AuthScreenStore {
  open: boolean;
  initialTab: "signin" | "signup";
  show: (tab?: "signin" | "signup") => void;
  hide: () => void;
}

export const useAuthScreen = create<AuthScreenStore>((set) => ({
  open: false,
  initialTab: "signin",
  show: (tab = "signin") => set({ open: true, initialTab: tab }),
  hide: () => set({ open: false }),
}));
