import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "aletheia.theme";

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "system" ? raw : "light";
}

interface SettingsState {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
    set({ theme });
  },
}));

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}
