import type { ColorTokenKey } from "./tokens";

/** A user's overrides for one color scheme — sparse by design, so the
 *  built-in stylesheet values fill in any unset token. */
export type TokenOverrides = Partial<Record<ColorTokenKey, string>>;

export interface Theme {
  id: string;
  name: string;
  author?: string;
  /** Built-in themes are read-only in the editor; users duplicate to edit. */
  builtIn?: boolean;
  light: TokenOverrides;
  dark: TokenOverrides;
}

/** Persisted shape of `preferences.json`. Version is bumped whenever the
 *  on-disk schema changes; the loader migrates older payloads forward. */
export interface PreferencesV1 {
  $schema: 1;
  activeTheme: string;
  themes: Record<string, Theme>;
}

export const DEFAULT_THEME_ID = "default";

export function emptyTheme(id: string, name: string): Theme {
  return { id, name, light: {}, dark: {} };
}

/** The built-in default. Empty overrides everywhere — the stylesheet's
 *  baked-in values supply every color. */
export function defaultTheme(): Theme {
  return {
    id: DEFAULT_THEME_ID,
    name: "Aletheia Default",
    author: "built-in",
    builtIn: true,
    light: {},
    dark: {},
  };
}
