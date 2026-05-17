/**
 * The single source of truth for which color tokens exist in the app.
 *
 * Every entry maps to a CSS custom property defined in `src/styles/index.css`
 * (with parallel light/dark values). The Design-tab editor iterates this list
 * to render its swatches, and `ThemeApplier` only writes overrides for keys
 * that appear here — so adding a new themable color is a one-line change to
 * this file plus matching `:root` and `.dark` entries in the stylesheet.
 *
 * Adding a token without updating index.css (or vice versa) is caught by
 * `tokens.test.ts`.
 */
export const TOKEN_GROUPS = [
  "Surface",
  "Text",
  "Accent",
  "Rule",
  "Highlight",
  "Scrim",
] as const;
export type TokenGroup = (typeof TOKEN_GROUPS)[number];

export interface ColorToken<K extends string = string> {
  /** CSS custom-property name without the leading `--`. */
  key: K;
  /** Display label in the editor. */
  label: string;
  group: TokenGroup;
}

export const COLOR_TOKENS = [
  { key: "color-bg",          label: "Background",        group: "Surface" },
  { key: "color-bg-elevated", label: "Elevated surface",  group: "Surface" },
  { key: "color-bg-inset",    label: "Inset surface",     group: "Surface" },

  { key: "color-fg",          label: "Text",              group: "Text" },
  { key: "color-fg-muted",    label: "Muted text",        group: "Text" },
  { key: "color-fg-subtle",   label: "Subtle text",       group: "Text" },

  { key: "color-accent",        label: "Accent",          group: "Accent" },
  { key: "color-accent-muted",  label: "Accent (muted)",  group: "Accent" },
  { key: "color-selection",     label: "Selection",       group: "Accent" },

  { key: "color-rule",          label: "Rule",            group: "Rule" },
  { key: "color-rule-strong",   label: "Rule (strong)",   group: "Rule" },

  { key: "color-hl-yellow",      label: "Saffron",        group: "Highlight" },
  { key: "color-hl-yellow-rule", label: "Saffron rule",   group: "Highlight" },
  { key: "color-hl-green",       label: "Sage",           group: "Highlight" },
  { key: "color-hl-green-rule",  label: "Sage rule",      group: "Highlight" },
  { key: "color-hl-blue",        label: "Lapis",          group: "Highlight" },
  { key: "color-hl-blue-rule",   label: "Lapis rule",     group: "Highlight" },
  { key: "color-hl-pink",        label: "Rose",           group: "Highlight" },
  { key: "color-hl-pink-rule",   label: "Rose rule",      group: "Highlight" },
  { key: "color-hl-purple",      label: "Iris",           group: "Highlight" },
  { key: "color-hl-purple-rule", label: "Iris rule",      group: "Highlight" },
  { key: "color-hl-orange",      label: "Amber",          group: "Highlight" },
  { key: "color-hl-orange-rule", label: "Amber rule",     group: "Highlight" },

  { key: "color-scrim",       label: "Scrim",             group: "Scrim" },
  { key: "color-scrim-soft",  label: "Scrim (soft)",      group: "Scrim" },
] as const satisfies readonly ColorToken[];

export type ColorTokenKey = (typeof COLOR_TOKENS)[number]["key"];

export const COLOR_TOKEN_KEYS: readonly ColorTokenKey[] =
  COLOR_TOKENS.map((t) => t.key) as readonly ColorTokenKey[];

/** Group tokens for editor display in a stable order. */
export function tokensByGroup(): Record<
  TokenGroup,
  readonly ColorToken<ColorTokenKey>[]
> {
  const out: Record<TokenGroup, ColorToken<ColorTokenKey>[]> = {
    Surface: [],
    Text: [],
    Accent: [],
    Rule: [],
    Highlight: [],
    Scrim: [],
  };
  for (const t of COLOR_TOKENS) out[t.group].push(t);
  return out;
}
