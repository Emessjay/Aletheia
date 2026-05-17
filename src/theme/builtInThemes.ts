/**
 * Bundled reference themes seeded on first launch. They register as built-in
 * (read-only) so users can browse them and duplicate to a fresh editable copy.
 *
 * Themes only need to specify the tokens they actually change — anything left
 * out falls through to the stylesheet baseline in src/styles/index.css. This
 * keeps the diffs small and forward-compatible: when new tokens are added in
 * the future, old themes inherit the new stylesheet defaults rather than
 * forcing a stale value.
 */
import type { Theme } from "./types";

export const SEPIA_THEME: Theme = {
  id: "sepia",
  name: "Sepia",
  author: "built-in",
  builtIn: true,
  light: {
    "color-bg":          "#f4ecd8",
    "color-bg-elevated": "#ede2c4",
    "color-bg-inset":    "#e5d8b3",
    "color-fg":          "#3a2d1c",
    "color-fg-muted":    "#6b5740",
    "color-fg-subtle":   "#94815f",
    "color-rule":        "#d6c7a0",
    "color-rule-strong": "#b5a37a",
    "color-accent":      "#8a4a1f",
    "color-accent-muted":"#a26a3e",
    "color-selection":   "#e8d59a",
  },
  // Sepia "dark" leans toward a deep walnut rather than pure black, so the
  // mood stays warm when the user flips schemes.
  dark: {
    "color-bg":          "#1f1812",
    "color-bg-elevated": "#26201a",
    "color-bg-inset":    "#171108",
    "color-fg":          "#ead9b8",
    "color-fg-muted":    "#a08862",
    "color-fg-subtle":   "#6b5840",
    "color-rule":        "#332a20",
    "color-rule-strong": "#473a2a",
    "color-accent":      "#d49060",
    "color-accent-muted":"#a26a3e",
    "color-selection":   "#3d2e1a",
  },
};

export const HIGH_CONTRAST_THEME: Theme = {
  id: "high-contrast",
  name: "High Contrast",
  author: "built-in",
  builtIn: true,
  light: {
    "color-bg":          "#ffffff",
    "color-bg-elevated": "#f4f4f4",
    "color-bg-inset":    "#eaeaea",
    "color-fg":          "#000000",
    "color-fg-muted":    "#2a2a2a",
    "color-fg-subtle":   "#555555",
    "color-rule":        "#888888",
    "color-rule-strong": "#000000",
    "color-accent":      "#a30000",
    "color-accent-muted":"#7a0000",
    "color-selection":   "#ffe066",
  },
  dark: {
    "color-bg":          "#000000",
    "color-bg-elevated": "#0a0a0a",
    "color-bg-inset":    "#161616",
    "color-fg":          "#ffffff",
    "color-fg-muted":    "#d0d0d0",
    "color-fg-subtle":   "#9a9a9a",
    "color-rule":        "#777777",
    "color-rule-strong": "#ffffff",
    "color-accent":      "#ff9090",
    "color-accent-muted":"#ffb0b0",
    "color-selection":   "#665020",
  },
};

export const BUILT_IN_THEMES: readonly Theme[] = [SEPIA_THEME, HIGH_CONTRAST_THEME];
