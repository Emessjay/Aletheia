import { create } from "zustand";
import type { CorpusLanguage } from "@/db/types";
import { readerTabTranslations } from "@/domain/translations";
import {
  resolveInterlinear,
  type PrimaryLang,
  type SecondaryLang,
  type Tab,
} from "@/domain/tabs";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "aletheia.theme";
const TABS_KEY = "aletheia.tabs";
// Legacy keys, read once for one-time migration.
const LEGACY_TRANSLATIONS_KEY = "aletheia.translations";
const LEGACY_TAB_ORDER_KEY = "aletheia.tabOrder";
const FONT_SIZE_KEY = "aletheia.fontSize";
const DROP_CAPS_KEY = "aletheia.dropCaps";
const AUDIO_BAR_KEY = "aletheia.audioBar";

export const DEFAULT_FONT_SIZE = 17;
export const MIN_FONT_SIZE = 13;
export const MAX_FONT_SIZE = 24;

// Languages exposed as togglable tabs in the reader header. Their order is
// user-rearrangeable and determines the rendering order of selected columns.
// Derived from the translations registry — flip `isReaderTab` there to add or
// remove an entry rather than editing this list.
export const TOGGLEABLE_LANGS: CorpusLanguage[] = readerTabTranslations().map(
  (t) => t.id,
);

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "dark" || raw === "system" ? raw : "light";
}

function defaultTabs(): Tab[] {
  return TOGGLEABLE_LANGS.map((lang) => ({
    kind: "single" as const,
    lang,
    active: lang === "en_bsb",
  }));
}

function isToggleable(v: unknown): v is CorpusLanguage {
  return typeof v === "string" && (TOGGLEABLE_LANGS as string[]).includes(v);
}

function isPrimary(v: unknown): v is PrimaryLang {
  return v === "he" || v === "gk";
}

function isSecondary(v: unknown): v is SecondaryLang {
  return v === "en_bsb" || v === "en_kjv";
}

function parseStoredTabs(raw: string): Tab[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: Tab[] = [];
    const seen = new Set<CorpusLanguage>();
    for (const v of parsed) {
      if (!v || typeof v !== "object") continue;
      const obj = v as Record<string, unknown>;
      const active = obj.active !== false; // default true
      if (obj.kind === "single") {
        if (!isToggleable(obj.lang)) continue;
        if (seen.has(obj.lang)) continue;
        seen.add(obj.lang);
        out.push({ kind: "single", lang: obj.lang, active });
      } else if (obj.kind === "interlinear") {
        if (!isPrimary(obj.primary) || !isSecondary(obj.secondary)) continue;
        if (seen.has(obj.primary) || seen.has(obj.secondary)) continue;
        seen.add(obj.primary);
        seen.add(obj.secondary);
        out.push({
          kind: "interlinear",
          primary: obj.primary,
          secondary: obj.secondary,
          active,
        });
      }
    }
    // Ensure every toggleable lang has a tab — append missing as inactive singles.
    for (const lang of TOGGLEABLE_LANGS) {
      if (!seen.has(lang)) out.push({ kind: "single", lang, active: false });
    }
    return out;
  } catch {
    return null;
  }
}

function migrateFromLegacy(): Tab[] | null {
  if (typeof window === "undefined") return null;
  const orderRaw = window.localStorage.getItem(LEGACY_TAB_ORDER_KEY);
  const transRaw = window.localStorage.getItem(LEGACY_TRANSLATIONS_KEY);
  if (!orderRaw && !transRaw) return null;

  let order: CorpusLanguage[] = TOGGLEABLE_LANGS.slice();
  if (orderRaw) {
    try {
      const parsed = JSON.parse(orderRaw) as unknown;
      if (Array.isArray(parsed)) {
        const seen = new Set<CorpusLanguage>();
        const ordered: CorpusLanguage[] = [];
        for (const v of parsed) {
          if (!isToggleable(v) || seen.has(v)) continue;
          seen.add(v);
          ordered.push(v);
        }
        for (const lang of TOGGLEABLE_LANGS) {
          if (!seen.has(lang)) ordered.push(lang);
        }
        order = ordered;
      }
    } catch {
      // Fall back to defaults.
    }
  }

  let active = new Set<CorpusLanguage>(["en_bsb"]);
  if (transRaw) {
    try {
      const parsed = JSON.parse(transRaw) as unknown;
      if (Array.isArray(parsed)) {
        const next = new Set<CorpusLanguage>();
        for (const v of parsed) {
          if (isToggleable(v)) next.add(v);
        }
        if (next.size > 0) active = next;
      }
    } catch {
      // Fall back.
    }
  }

  return order.map((lang) => ({
    kind: "single" as const,
    lang,
    active: active.has(lang),
  }));
}

function readTabs(): Tab[] {
  if (typeof window === "undefined") return defaultTabs();
  const raw = window.localStorage.getItem(TABS_KEY);
  if (raw) {
    const parsed = parseStoredTabs(raw);
    if (parsed && parsed.length > 0) return parsed;
  }
  const migrated = migrateFromLegacy();
  if (migrated && migrated.length > 0) return migrated;
  return defaultTabs();
}

function writeTabs(tabs: Tab[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
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

function readAudioBar(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(AUDIO_BAR_KEY);
  return raw === null ? true : raw === "1";
}

function ensureAtLeastOneActive(tabs: Tab[]): Tab[] {
  if (tabs.some((t) => t.active)) return tabs;
  // Reactivate BSB if present; else the first single tab; else the first tab.
  const bsb = tabs.findIndex((t) => t.kind === "single" && t.lang === "en_bsb");
  const firstSingle = tabs.findIndex((t) => t.kind === "single");
  const target = bsb >= 0 ? bsb : firstSingle >= 0 ? firstSingle : 0;
  if (tabs.length === 0) return tabs;
  return tabs.map((t, i) => (i === target ? { ...t, active: true } : t));
}

/** Languages contained in a tab (single = its lang; interlinear = primary + secondary). */
export function tabLangs(tab: Tab): CorpusLanguage[] {
  if (tab.kind === "single") return [tab.lang];
  return [tab.primary, tab.secondary];
}

interface SettingsState {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;

  tabs: Tab[];
  toggleTabAt: (index: number) => void;
  reorderTab: (srcIdx: number, dstIdx: number, position: "before" | "after") => void;
  /** Returns true on success, false for an invalid pair (caller should snap back). */
  mergeTabs: (srcIdx: number, dstIdx: number) => boolean;
  splitTab: (index: number) => void;

  /** Toggle a translation in the Settings page. Splits any interlinear that contains it. */
  toggleTranslation: (lang: CorpusLanguage) => void;
  isTranslationActive: (lang: CorpusLanguage) => boolean;

  fontSize: number;
  setFontSize: (n: number) => void;
  dropCapsEnabled: boolean;
  setDropCapsEnabled: (v: boolean) => void;
  audioBarEnabled: boolean;
  setAudioBarEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
    set({ theme });
  },

  tabs: readTabs(),

  toggleTabAt: (index) => {
    const { tabs } = get();
    if (index < 0 || index >= tabs.length) return;
    let next = tabs.map((t, i) => (i === index ? { ...t, active: !t.active } : t));
    next = ensureAtLeastOneActive(next);
    writeTabs(next);
    set({ tabs: next });
  },

  reorderTab: (srcIdx, dstIdx, position) => {
    const { tabs } = get();
    if (srcIdx === dstIdx) return;
    if (srcIdx < 0 || srcIdx >= tabs.length) return;
    if (dstIdx < 0 || dstIdx >= tabs.length) return;
    const src = tabs[srcIdx];
    const dst = tabs[dstIdx];
    const without = tabs.filter((_, i) => i !== srcIdx);
    const newDst = without.indexOf(dst);
    if (newDst < 0) return;
    const insertAt = position === "after" ? newDst + 1 : newDst;
    without.splice(insertAt, 0, src);
    writeTabs(without);
    set({ tabs: without });
  },

  mergeTabs: (srcIdx, dstIdx) => {
    const { tabs } = get();
    if (srcIdx === dstIdx) return false;
    const src = tabs[srcIdx];
    const dst = tabs[dstIdx];
    if (!src || !dst) return false;
    if (src.kind !== "single" || dst.kind !== "single") return false;
    const resolved = resolveInterlinear(src.lang, dst.lang);
    if (!resolved) return false;
    const merged: Tab = {
      kind: "interlinear",
      primary: resolved.primary,
      secondary: resolved.secondary,
      active: true,
    };
    const next: Tab[] = [];
    for (let i = 0; i < tabs.length; i++) {
      if (i === srcIdx) continue;
      if (i === dstIdx) {
        next.push(merged);
        continue;
      }
      next.push(tabs[i]);
    }
    const final = ensureAtLeastOneActive(next);
    writeTabs(final);
    set({ tabs: final });
    return true;
  },

  splitTab: (index) => {
    const { tabs } = get();
    const tab = tabs[index];
    if (!tab || tab.kind !== "interlinear") return;
    const wasActive = tab.active;
    const splitTabs: Tab[] = [
      { kind: "single", lang: tab.primary, active: wasActive },
      { kind: "single", lang: tab.secondary, active: wasActive },
    ];
    const next = [
      ...tabs.slice(0, index),
      ...splitTabs,
      ...tabs.slice(index + 1),
    ];
    const final = ensureAtLeastOneActive(next);
    writeTabs(final);
    set({ tabs: final });
  },

  toggleTranslation: (lang) => {
    const { tabs } = get();
    let found = -1;
    for (let i = 0; i < tabs.length; i++) {
      if (tabLangs(tabs[i]).includes(lang)) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      const next = [...tabs, { kind: "single" as const, lang, active: true }];
      writeTabs(next);
      set({ tabs: next });
      return;
    }
    const tab = tabs[found];
    if (tab.kind === "interlinear") {
      // Splitting the interlinear and then "toggling off" the requested lang
      // mirrors a user expectation: the other half stays visible.
      const splitTabs: Tab[] = [
        { kind: "single", lang: tab.primary, active: tab.active },
        { kind: "single", lang: tab.secondary, active: tab.active },
      ];
      const newTabs = [
        ...tabs.slice(0, found),
        ...splitTabs,
        ...tabs.slice(found + 1),
      ];
      const targetIdx = newTabs.findIndex(
        (t) => t.kind === "single" && t.lang === lang,
      );
      let next =
        targetIdx >= 0
          ? newTabs.map((t, i) =>
              i === targetIdx ? { ...t, active: !t.active } : t,
            )
          : newTabs;
      next = ensureAtLeastOneActive(next);
      writeTabs(next);
      set({ tabs: next });
      return;
    }
    let next = tabs.map((t, i) =>
      i === found ? { ...t, active: !t.active } : t,
    );
    next = ensureAtLeastOneActive(next);
    writeTabs(next);
    set({ tabs: next });
  },

  isTranslationActive: (lang) => {
    const { tabs } = get();
    return tabs.some((t) => t.active && tabLangs(t).includes(lang));
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
  audioBarEnabled: readAudioBar(),
  setAudioBarEnabled: (v) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIO_BAR_KEY, v ? "1" : "0");
    }
    set({ audioBarEnabled: v });
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
