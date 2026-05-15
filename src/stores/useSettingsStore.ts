import { create } from "zustand";
import type { CorpusLanguage } from "@/db/types";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "aletheia.theme";
const TRANSLATIONS_KEY = "aletheia.translations";
const FONT_SIZE_KEY = "aletheia.fontSize";
const DROP_CAPS_KEY = "aletheia.dropCaps";

export const DEFAULT_FONT_SIZE = 17;
export const MIN_FONT_SIZE = 13;
export const MAX_FONT_SIZE = 24;

const VALID_LANGS: CorpusLanguage[] = [
  "he",
  "gk",
  "en_bsb",
  "en_kjv",
  "en_brenton",
  "la",
];

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "system" ? raw : "light";
}

function readActiveTranslations(): CorpusLanguage[] {
  if (typeof window === "undefined") return ["en_bsb"];
  try {
    const raw = window.localStorage.getItem(TRANSLATIONS_KEY);
    if (!raw) return ["en_bsb"];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ["en_bsb"];
    const filtered = parsed.filter((v): v is CorpusLanguage =>
      typeof v === "string" && (VALID_LANGS as string[]).includes(v),
    );
    return filtered.length > 0 ? filtered : ["en_bsb"];
  } catch {
    return ["en_bsb"];
  }
}

function readFontSize(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
  const raw = window.localStorage.getItem(FONT_SIZE_KEY);
  const n = raw ? Number(raw) : DEFAULT_FONT_SIZE;
  return Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE
    ? n
    : DEFAULT_FONT_SIZE;
}

function readDropCaps(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DROP_CAPS_KEY);
  return raw === null ? true : raw === "1";
}

interface SettingsState {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  activeTranslations: CorpusLanguage[];
  toggleTranslation: (lang: CorpusLanguage) => void;
  setActiveTranslations: (langs: CorpusLanguage[]) => void;
  fontSize: number;
  setFontSize: (n: number) => void;
  dropCapsEnabled: boolean;
  setDropCapsEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
    set({ theme });
  },
  activeTranslations: readActiveTranslations(),
  toggleTranslation: (lang) => {
    const current = get().activeTranslations;
    const next = current.includes(lang)
      ? current.filter((l) => l !== lang)
      : [...current, lang];
    const safe = next.length === 0 ? ["en_bsb" as CorpusLanguage] : next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TRANSLATIONS_KEY, JSON.stringify(safe));
    }
    set({ activeTranslations: safe });
  },
  setActiveTranslations: (langs) => {
    const safe = langs.length === 0 ? ["en_bsb" as CorpusLanguage] : langs;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TRANSLATIONS_KEY, JSON.stringify(safe));
    }
    set({ activeTranslations: safe });
  },
  fontSize: readFontSize(),
  setFontSize: (n) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FONT_SIZE_KEY, String(clamped));
    }
    set({ fontSize: clamped });
  },
  dropCapsEnabled: readDropCaps(),
  setDropCapsEnabled: (v) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DROP_CAPS_KEY, v ? "1" : "0");
    }
    set({ dropCapsEnabled: v });
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
