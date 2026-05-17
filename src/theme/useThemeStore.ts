import { create } from "zustand";
import { BUILT_IN_THEMES } from "./builtInThemes";
import {
  makeDebouncedWriter,
  readPreferencesFromDisk,
  writePreferencesToDisk,
} from "./preferences";
import { COLOR_TOKEN_KEYS, type ColorTokenKey } from "./tokens";
import {
  defaultTheme,
  DEFAULT_THEME_ID,
  emptyTheme,
  type PreferencesV1,
  type Theme,
} from "./types";

const STORAGE_KEY = "aletheia.themes";

// Disk writes are debounced so dragging a color picker doesn't fire one per
// frame. localStorage stays synchronous — it's the fast-path cache.
const writeDiskDebounced = makeDebouncedWriter(200);

/** Force any pending debounced disk write to fire immediately. Wired to
 *  `pagehide` in ThemeApplier so the user's last edits don't sit in memory
 *  when the app is closing. */
export function flushPendingDiskWrite(): void {
  writeDiskDebounced.flush();
}

export type Scheme = "light" | "dark";

interface ThemeState {
  themes: Record<string, Theme>;
  activeThemeId: string;

  /** All theme ids in display order — built-ins first, then user themes by name. */
  themeIds: () => string[];
  activeTheme: () => Theme;

  setActiveTheme: (id: string) => void;
  setOverride: (scheme: Scheme, key: ColorTokenKey, value: string) => void;
  resetToken: (scheme: Scheme, key: ColorTokenKey) => void;
  resetAll: () => void;

  /** Create a new editable theme by copying the given source (or the active
   *  theme if `sourceId` is omitted). Returns the new theme id. */
  duplicateTheme: (sourceId?: string, newName?: string) => string;
  deleteTheme: (id: string) => void;
  renameTheme: (id: string, name: string) => void;

  /** Replace a theme's contents wholesale (used by import). */
  upsertTheme: (theme: Theme) => void;

  /** Read the on-disk preferences file (if present) and merge it into state.
   *  Idempotent — safe to call multiple times. */
  hydrateFromDisk: () => Promise<void>;
}

function safeReadStorage(): PreferencesV1 | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "$schema" in parsed &&
      (parsed as { $schema: unknown }).$schema === 1
    ) {
      return parsed as PreferencesV1;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function buildPayload(state: {
  themes: Record<string, Theme>;
  activeThemeId: string;
}): PreferencesV1 {
  // Persist only user-authored themes — built-ins are seeded from code on
  // load, so storing them would (a) bloat the file and (b) freeze stale
  // values that future versions of the app couldn't update.
  const userThemes: Record<string, Theme> = {};
  for (const [id, t] of Object.entries(state.themes)) {
    if (!t.builtIn) userThemes[id] = t;
  }
  return {
    $schema: 1,
    activeTheme: state.activeThemeId,
    themes: userThemes,
  };
}

function persist(state: { themes: Record<string, Theme>; activeThemeId: string }) {
  const payload = buildPayload(state);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }
  writeDiskDebounced(payload);
}

function sanitizeOverrides(
  raw: unknown,
): Partial<Record<ColorTokenKey, string>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<ColorTokenKey, string>> = {};
  for (const k of COLOR_TOKEN_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

function sanitizeTheme(raw: unknown): Theme | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || typeof obj.name !== "string") return null;
  return {
    id: obj.id,
    name: obj.name,
    author: typeof obj.author === "string" ? obj.author : undefined,
    builtIn: obj.builtIn === true,
    light: sanitizeOverrides(obj.light),
    dark: sanitizeOverrides(obj.dark),
  };
}

function loadInitial(): { themes: Record<string, Theme>; activeThemeId: string } {
  const stored = safeReadStorage();
  const themes: Record<string, Theme> = { [DEFAULT_THEME_ID]: defaultTheme() };
  // Seed bundled reference themes. They're re-seeded on every launch so updates
  // to their token values in code ship to existing users; the user can still
  // override by duplicating to an editable copy.
  const builtInIds = new Set<string>([DEFAULT_THEME_ID]);
  for (const t of BUILT_IN_THEMES) {
    themes[t.id] = t;
    builtInIds.add(t.id);
  }
  let activeThemeId = DEFAULT_THEME_ID;

  if (stored) {
    for (const [id, raw] of Object.entries(stored.themes ?? {})) {
      const t = sanitizeTheme(raw);
      if (!t) continue;
      // Built-ins are re-seeded above; never let a stored copy clobber them.
      if (builtInIds.has(t.id)) continue;
      themes[id] = t;
    }
    if (stored.activeTheme && themes[stored.activeTheme]) {
      activeThemeId = stored.activeTheme;
    }
  }

  return { themes, activeThemeId };
}

function uniqueId(themes: Record<string, Theme>, base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "theme";
  if (!themes[slug]) return slug;
  let i = 2;
  while (themes[`${slug}-${i}`]) i++;
  return `${slug}-${i}`;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initial = loadInitial();

  return {
    themes: initial.themes,
    activeThemeId: initial.activeThemeId,

    themeIds: () => {
      const all = Object.values(get().themes);
      all.sort((a, b) => {
        if (!!a.builtIn !== !!b.builtIn) return a.builtIn ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return all.map((t) => t.id);
    },

    activeTheme: () => {
      const { themes, activeThemeId } = get();
      return themes[activeThemeId] ?? themes[DEFAULT_THEME_ID];
    },

    setActiveTheme: (id) => {
      const { themes } = get();
      if (!themes[id]) return;
      const next = { ...get(), activeThemeId: id };
      persist(next);
      set({ activeThemeId: id });
    },

    setOverride: (scheme, key, value) => {
      const { themes, activeThemeId } = get();
      const t = themes[activeThemeId];
      if (!t || t.builtIn) return;
      const updated: Theme = {
        ...t,
        [scheme]: { ...t[scheme], [key]: value },
      };
      const nextThemes = { ...themes, [activeThemeId]: updated };
      persist({ themes: nextThemes, activeThemeId });
      set({ themes: nextThemes });
    },

    resetToken: (scheme, key) => {
      const { themes, activeThemeId } = get();
      const t = themes[activeThemeId];
      if (!t || t.builtIn) return;
      const nextScheme = { ...t[scheme] };
      delete nextScheme[key];
      const updated: Theme = { ...t, [scheme]: nextScheme };
      const nextThemes = { ...themes, [activeThemeId]: updated };
      persist({ themes: nextThemes, activeThemeId });
      set({ themes: nextThemes });
    },

    resetAll: () => {
      const { themes, activeThemeId } = get();
      const t = themes[activeThemeId];
      if (!t || t.builtIn) return;
      const updated: Theme = { ...t, light: {}, dark: {} };
      const nextThemes = { ...themes, [activeThemeId]: updated };
      persist({ themes: nextThemes, activeThemeId });
      set({ themes: nextThemes });
    },

    duplicateTheme: (sourceId, newName) => {
      const { themes, activeThemeId } = get();
      const src = themes[sourceId ?? activeThemeId] ?? themes[DEFAULT_THEME_ID];
      const proposedName = newName ?? `${src.name} (copy)`;
      const id = uniqueId(themes, proposedName);
      const copy: Theme = {
        id,
        name: proposedName,
        light: { ...src.light },
        dark: { ...src.dark },
      };
      const nextThemes = { ...themes, [id]: copy };
      persist({ themes: nextThemes, activeThemeId: id });
      set({ themes: nextThemes, activeThemeId: id });
      return id;
    },

    deleteTheme: (id) => {
      const { themes, activeThemeId } = get();
      const t = themes[id];
      if (!t || t.builtIn) return;
      const next = { ...themes };
      delete next[id];
      const nextActive =
        activeThemeId === id ? DEFAULT_THEME_ID : activeThemeId;
      persist({ themes: next, activeThemeId: nextActive });
      set({ themes: next, activeThemeId: nextActive });
    },

    renameTheme: (id, name) => {
      const { themes, activeThemeId } = get();
      const t = themes[id];
      if (!t || t.builtIn) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const updated: Theme = { ...t, name: trimmed };
      const nextThemes = { ...themes, [id]: updated };
      persist({ themes: nextThemes, activeThemeId });
      set({ themes: nextThemes });
    },

    upsertTheme: (theme) => {
      const sanitized = sanitizeTheme(theme);
      if (!sanitized) return;
      // Imports never overwrite the canonical built-in default; collide on id by
      // suffixing until unique, otherwise the user has no way to restore it.
      const { themes, activeThemeId } = get();
      let targetId = sanitized.id;
      if (targetId === DEFAULT_THEME_ID || themes[targetId]) {
        targetId = uniqueId(themes, sanitized.name);
      }
      // Imports come in as user-owned regardless of any builtIn flag in the file.
      const entry: Theme = { ...sanitized, id: targetId, builtIn: false };
      const nextThemes = { ...themes, [targetId]: entry };
      persist({ themes: nextThemes, activeThemeId });
      set({ themes: nextThemes });
    },

    hydrateFromDisk: async () => {
      const fromDisk = await readPreferencesFromDisk();
      if (fromDisk) {
        // Disk is authoritative. Re-seed built-ins from code so a stale on-disk
        // copy can't pin them, then layer the user-authored themes on top.
        const themes: Record<string, Theme> = { [DEFAULT_THEME_ID]: defaultTheme() };
        const builtInIds = new Set<string>([DEFAULT_THEME_ID]);
        for (const t of BUILT_IN_THEMES) {
          themes[t.id] = t;
          builtInIds.add(t.id);
        }
        for (const [id, raw] of Object.entries(fromDisk.themes ?? {})) {
          const t = sanitizeTheme(raw);
          if (!t || builtInIds.has(t.id)) continue;
          themes[id] = t;
        }
        const activeThemeId =
          fromDisk.activeTheme && themes[fromDisk.activeTheme]
            ? fromDisk.activeTheme
            : DEFAULT_THEME_ID;
        // Mirror into localStorage so the next cold start can paint instantly
        // without waiting on disk.
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(buildPayload({ themes, activeThemeId })),
          );
        }
        set({ themes, activeThemeId });
        return;
      }
      // No file on disk. If the current in-memory state has user themes
      // (recovered from localStorage by loadInitial), push them out so the
      // file becomes the durable record going forward.
      const state = get();
      const hasUserThemes = Object.values(state.themes).some((t) => !t.builtIn);
      if (hasUserThemes) {
        await writePreferencesToDisk(buildPayload(state));
      }
    },
  };
});

/** Resolve the effective color value for a token under a given scheme,
 *  walking from active-theme override down to "unset" (let CSS supply it). */
export function resolveTokenValue(
  theme: Theme,
  scheme: Scheme,
  key: ColorTokenKey,
): string | undefined {
  return theme[scheme][key];
}

// Re-export for callers that want a single import surface.
export { emptyTheme, defaultTheme };
