import { useEffect } from "react";
import { useSettingsStore, resolveTheme } from "@/stores/useSettingsStore";
import { COLOR_TOKENS } from "@/theme/tokens";
import {
  flushPendingDiskWrite,
  useThemeStore,
  type Scheme,
} from "@/theme/useThemeStore";

/**
 * Applies the active theme's overrides as inline CSS custom properties on
 * `<html>`. Anything the active theme leaves unset falls through to the
 * stylesheet defaults declared in `src/styles/index.css`.
 *
 * Mounted alongside SettingsApplier in main.tsx. Re-runs when the active
 * theme, the theme's tokens, or the resolved light/dark scheme change.
 *
 * Scrupulously removes overrides for tokens the active theme no longer
 * customises — without this, switching from a tweaked theme back to the
 * built-in default would leak the previous values onto `documentElement`.
 */
export function ThemeApplier({ children }: { children: React.ReactNode }) {
  const mode = useSettingsStore((s) => s.theme);
  const theme = useThemeStore((s) => s.themes[s.activeThemeId]);
  const hydrateFromDisk = useThemeStore((s) => s.hydrateFromDisk);

  // Pull the on-disk preferences file in once at startup. The synchronous
  // localStorage cache has already populated state, so this is purely an
  // upgrade pass — any disk-side change since the last write wins.
  useEffect(() => {
    void hydrateFromDisk();
  }, [hydrateFromDisk]);

  // Flush any pending debounced disk write when the app is about to close,
  // so the next launch's hydrate sees the user's latest edits rather than a
  // stale snapshot from before the last batch of changes.
  useEffect(() => {
    const handler = () => flushPendingDiskWrite();
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  useEffect(() => {
    if (!theme) return undefined;
    let cancelled = false;

    const apply = () => {
      if (cancelled) return;
      const scheme: Scheme = resolveTheme(mode);
      const overrides = theme[scheme];
      const root = document.documentElement.style;
      for (const { key } of COLOR_TOKENS) {
        const v = overrides[key];
        if (v) root.setProperty(`--${key}`, v);
        else root.removeProperty(`--${key}`);
      }
    };

    apply();

    if (mode !== "system") return () => { cancelled = true; };
    // Re-apply when the system scheme flips while mode === "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => {
      cancelled = true;
      mq.removeEventListener("change", apply);
    };
  }, [mode, theme]);

  return <>{children}</>;
}
