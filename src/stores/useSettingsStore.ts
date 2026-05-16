import { create } from "zustand";
import type { CorpusLanguage } from "@/db/types";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "aletheia.theme";
const TRANSLATIONS_KEY = "aletheia.translations";
const TAB_ORDER_KEY = "aletheia.tabOrder";
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

// Languages exposed as togglable tabs in the reader header. Their order is
// user-rearrangeable and determines the rendering order of selected columns.
export const TOGGLEABLE_LANGS: CorpusLanguage[] = [
  "en_bsb",
  "en_kjv",
  "gk",
  "he",
];

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "system" ? raw : "light";
}

function readTabOrder(): CorpusLanguage[] {
  if (typeof window === "undefined") return TOGGLEABLE_LANGS;
  try {
    const raw = window.localStorage.getItem(TAB_ORDER_KEY);
    if (!raw) return TOGGLEABLE_LANGS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return TOGGLEABLE_LANGS;
    const seen = new Set<CorpusLanguage>();
    const ordered: CorpusLanguage[] = [];
    for (const v of parsed) {
      if (typeof v !== "string") continue;
      if (!(TOGGLEABLE_LANGS as string[]).includes(v)) continue;
      const lang = v as CorpusLanguage;
      if (seen.has(lang)) continue;
      seen.add(lang);
      ordered.push(lang);
    }
    // Append any toggleable langs missing from the stored order so newly
    // introduced langs still appear as tabs.
    for (const lang of TOGGLEABLE_LANGS) {
      if (!seen.has(lang)) ordered.push(lang);
    }
    return ordered;
  } catch {
    return TOGGLEABLE_LANGS;
  }
}

function sortByTabOrder(
  active: CorpusLanguage[],
  tabOrder: CorpusLanguage[],
): CorpusLanguage[] {
  const set = new Set(active);
  const next: CorpusLanguage[] = [];
  for (const lang of tabOrder) {
    if (set.has(lang)) next.push(lang);
  }
  // Preserve any active langs that aren't in the tab order (e.g. en_brenton, la
  // set via other paths) by appending them in their original relative order.
  for (const lang of active) {
    if (!tabOrder.includes(lang) && !next.includes(lang)) next.push(lang);
  }
  return next;
}

function readActiveTranslations(tabOrder: CorpusLanguage[]): CorpusLanguage[] {
  if (typeof window === "undefined") return ["en_bsb"];
  try {
    const raw = window.localStorage.getItem(TRANSLATIONS_KEY);
    if (!raw) return ["en_bsb"];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ["en_bsb"];
    const filtered = parsed.filter((v): v is CorpusLanguage =>
      typeof v === "string" && (VALID_LANGS as string[]).includes(v),
    );
    if (filtered.length === 0) return ["en_bsb"];
    return sortByTabOrder(filtered, tabOrder);
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
  tabOrder: CorpusLanguage[];
  setTabOrder: (langs: CorpusLanguage[]) => void;
  fontSize: number;
  setFontSize: (n: number) => void;
  dropCapsEnabled: boolean;
  setDropCapsEnabled: (v: boolean) => void;
}

const initialTabOrder = readTabOrder();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
    set({ theme });
  },
  tabOrder: initialTabOrder,
  setTabOrder: (langs) => {
    const seen = new Set<CorpusLanguage>();
    const ordered: CorpusLanguage[] = [];
    for (const l of langs) {
      if (!(TOGGLEABLE_LANGS as string[]).includes(l)) continue;
      if (seen.has(l)) continue;
      seen.add(l);
      ordered.push(l);
    }
    for (const l of TOGGLEABLE_LANGS) {
      if (!seen.has(l)) ordered.push(l);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(ordered));
    }
    const reordered = sortByTabOrder(get().activeTranslations, ordered);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        TRANSLATIONS_KEY,
        JSON.stringify(reordered),
      );
    }
    set({ tabOrder: ordered, activeTranslations: reordered });
  },
  activeTranslations: readActiveTranslations(initialTabOrder),
  toggleTranslation: (lang) => {
    const { activeTranslations, tabOrder } = get();
    const nextSet = new Set(activeTranslations);
    if (nextSet.has(lang)) nextSet.delete(lang);
    else nextSet.add(lang);
    const next = sortByTabOrder(Array.from(nextSet), tabOrder);
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
