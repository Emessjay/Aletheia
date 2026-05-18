import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HexColorPicker, RgbaColorPicker } from "react-colorful";
import { useSettingsStore, resolveTheme } from "@/stores/useSettingsStore";
import {
  TOKEN_GROUPS,
  tokensByGroup,
  type ColorToken,
  type ColorTokenKey,
} from "@/theme/tokens";
import { useThemeStore, type Scheme } from "@/theme/useThemeStore";
import type { Theme } from "@/theme/types";
import { formatRgba, parseColor, toHex } from "@/theme/colorFormat";

const SCRIM_TOKEN_KEYS = new Set<ColorTokenKey>(["color-scrim", "color-scrim-soft"]);

/** Encode a (theme, scheme) pair as the <option value="…"> string. */
function selectionKey(themeId: string, scheme: Scheme): string {
  return `${themeId}::${scheme}`;
}
function parseSelection(key: string): { themeId: string; scheme: Scheme } | null {
  const idx = key.lastIndexOf("::");
  if (idx < 0) return null;
  const themeId = key.slice(0, idx);
  const scheme = key.slice(idx + 2) as Scheme;
  if (scheme !== "light" && scheme !== "dark") return null;
  return { themeId, scheme };
}

export function ThemeEditor() {
  const themes = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const themeIds = useThemeStore((s) => s.themeIds);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);
  const duplicateTheme = useThemeStore((s) => s.duplicateTheme);
  const deleteTheme = useThemeStore((s) => s.deleteTheme);
  const renameTheme = useThemeStore((s) => s.renameTheme);
  const resetAll = useThemeStore((s) => s.resetAll);
  const upsertTheme = useThemeStore((s) => s.upsertTheme);

  const mode = useSettingsStore((s) => s.theme);
  const setMode = useSettingsStore((s) => s.setTheme);
  const resolved = resolveTheme(mode);
  // The edit-scheme is the user's last explicit pick in the dropdown.
  // It defaults to whichever scheme the app is currently rendering so the
  // editor and the live preview line up on first open.
  const [editScheme, setEditScheme] = useState<Scheme>(resolved);

  const active = themes[activeThemeId];
  const isBuiltIn = !!active?.builtIn;
  const grouped = tokensByGroup();

  // Picking a "(Light)" or "(Dark)" entry both selects the theme and pins the
  // app's rendered scheme to match — otherwise editing a dark palette while
  // the window stays light would make every swatch and preview misleading.
  const onSelectionChange = (key: string) => {
    const parsed = parseSelection(key);
    if (!parsed) return;
    setActiveTheme(parsed.themeId);
    setEditScheme(parsed.scheme);
    if (resolved !== parsed.scheme) setMode(parsed.scheme);
  };

  // If the rendered scheme changes from outside (e.g. the header toggle), keep
  // the editor's scheme in sync so the swatches reflect what's on screen.
  useEffect(() => {
    setEditScheme(resolved);
  }, [resolved]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onImportClick = () => fileInputRef.current?.click();
  const onImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Accept either a bare Theme or the full PreferencesV1 payload. Track
      // the imported ids so we can activate one when the user is done — without
      // that, the colors land in state but the editor still shows whatever
      // theme was active beforehand, which makes import look broken.
      const imported: string[] = [];
      let preferredActive: string | null = null;
      if (parsed && typeof parsed === "object" && "$schema" in parsed) {
        const themes = (parsed as { themes?: Record<string, unknown> }).themes ?? {};
        const declaredActive = (parsed as { activeTheme?: unknown }).activeTheme;
        for (const [origId, raw] of Object.entries(themes)) {
          const finalId = upsertTheme(raw as Theme);
          if (!finalId) continue;
          imported.push(finalId);
          if (typeof declaredActive === "string" && declaredActive === origId) {
            preferredActive = finalId;
          }
        }
      } else {
        const finalId = upsertTheme(parsed as Theme);
        if (finalId) imported.push(finalId);
      }
      const toActivate = preferredActive ?? imported[0];
      if (toActivate) setActiveTheme(toActivate);
    } catch (err) {
      console.error("theme import failed", err);
      alert("Could not import theme — invalid JSON or schema.");
    }
  };

  const onExport = () => {
    if (!active) return;
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.id}.aletheia-theme.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!active) return null;

  return (
    <section
      style={{
        border: "1px solid var(--color-rule)",
        background: "var(--color-bg-elevated)",
        padding: "16px 18px",
        marginBottom: "1.5rem",
      }}
    >
      <Header
        themeIds={themeIds()}
        themes={themes}
        activeSelection={selectionKey(active.id, editScheme)}
        isBuiltIn={isBuiltIn}
        onSelectionChange={onSelectionChange}
        onDuplicate={() => duplicateTheme()}
        onDelete={() => {
          if (confirm(`Delete theme "${active.name}"? Both its light and dark palettes will be removed.`)) {
            deleteTheme(active.id);
          }
        }}
        onRename={() => {
          const name = prompt("Rename theme", active.name);
          if (name && name.trim()) renameTheme(active.id, name.trim());
        }}
        onResetAll={() => {
          if (confirm("Reset every customised token in this theme (light + dark) to its default?")) resetAll();
        }}
        onExport={onExport}
        onImport={onImportClick}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={onImportChange}
      />

      <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12, color: "var(--color-fg-subtle)" }}>
        Editing the <strong>{editScheme}</strong> palette of <strong>{active.name}</strong>. The light and
        dark variants are stored on the same theme — switch between them above.
      </p>

      <div style={{ marginTop: 12 }}>
        {TOKEN_GROUPS.map((group) => (
          <TokenGroupSection
            key={group}
            label={group}
            tokens={grouped[group]}
            scheme={editScheme}
            theme={active}
            readOnly={isBuiltIn}
          />
        ))}
      </div>

      {isBuiltIn ? (
        <p style={{ marginTop: 14, fontSize: 13, color: "var(--color-fg-muted)", fontStyle: "italic" }}>
          Built-in themes are read-only. <button onClick={() => duplicateTheme()} style={linkButtonStyle}>Duplicate</button> to start editing.
        </p>
      ) : null}
    </section>
  );
}

function Header(props: {
  themeIds: string[];
  themes: Record<string, Theme>;
  activeSelection: string;
  isBuiltIn: boolean;
  onSelectionChange: (selection: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: () => void;
  onResetAll: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  // Flatten themes into one option per (theme, scheme) so the dark variant of
  // every theme is selectable directly, no hidden sub-tab. Each theme's two
  // entries are grouped together via <optgroup> so the dropdown reads as
  // "Aletheia Default → Light / Dark" rather than an undifferentiated list.
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <select
        value={props.activeSelection}
        onChange={(e) => props.onSelectionChange(e.target.value)}
        style={{
          font: "inherit",
          padding: "5px 8px",
          background: "var(--color-bg)",
          color: "var(--color-fg)",
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 2,
        }}
      >
        {props.themeIds.map((id) => {
          const t = props.themes[id];
          if (!t) return null;
          const suffix = t.builtIn ? " (built-in)" : "";
          return (
            <optgroup key={id} label={`${t.name}${suffix}`}>
              <option value={selectionKey(id, "light")}>{t.name} — Light</option>
              <option value={selectionKey(id, "dark")}>{t.name} — Dark</option>
            </optgroup>
          );
        })}
      </select>
      <button onClick={props.onDuplicate} style={buttonStyle}>Duplicate</button>
      <button
        onClick={props.onRename}
        disabled={props.isBuiltIn}
        style={buttonStyle}
      >
        Rename
      </button>
      <button
        onClick={props.onResetAll}
        disabled={props.isBuiltIn}
        style={buttonStyle}
      >
        Reset all
      </button>
      <button
        onClick={props.onDelete}
        disabled={props.isBuiltIn}
        style={buttonStyle}
      >
        Delete
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={props.onImport} style={buttonStyle}>Import…</button>
      <button onClick={props.onExport} style={buttonStyle}>Export</button>
    </div>
  );
}

function TokenGroupSection({
  label,
  tokens,
  scheme,
  theme,
  readOnly,
}: {
  label: string;
  tokens: readonly ColorToken<ColorTokenKey>[];
  scheme: Scheme;
  theme: Theme;
  readOnly: boolean;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="al-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {tokens.map((t) => (
          <TokenRow
            key={t.key}
            token={t}
            scheme={scheme}
            theme={theme}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

function TokenRow({
  token,
  scheme,
  theme,
  readOnly,
}: {
  token: ColorToken<ColorTokenKey>;
  scheme: Scheme;
  theme: Theme;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const override = theme[scheme][token.key];
  // The "effective" value is whatever the cascade actually renders right now.
  // Read it from the live document so users see exactly what they're editing,
  // including any stylesheet default they haven't overridden yet. The read
  // re-runs whenever the active theme reference or scheme changes so the
  // swatch stays in sync with whatever ThemeApplier just wrote.
  const effective = useEffectiveTokenValue(token.key, theme, scheme);
  const display = override ?? effective ?? "";
  const isCustomised = !!override;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule)",
        position: "relative",
      }}
    >
      <button
        onClick={() => !readOnly && setOpen((v) => !v)}
        disabled={readOnly}
        title={readOnly ? "Duplicate the theme to edit" : "Edit color"}
        style={{
          width: 26,
          height: 26,
          padding: 0,
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 2,
          cursor: readOnly ? "default" : "pointer",
          backgroundColor: "transparent",
          backgroundImage: `
            linear-gradient(${display}, ${display}),
            linear-gradient(45deg, var(--color-bg-inset) 25%, transparent 25%, transparent 75%, var(--color-bg-inset) 75%),
            linear-gradient(45deg, var(--color-bg-inset) 25%, transparent 25%, transparent 75%, var(--color-bg-inset) 75%)
          `,
          backgroundSize: "100% 100%, 8px 8px, 8px 8px",
          backgroundPosition: "0 0, 0 0, 4px 4px",
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, color: isCustomised ? "var(--color-fg)" : "var(--color-fg-muted)" }}>
          {token.label}
          {isCustomised ? <span style={{ color: "var(--color-accent)" }}> •</span> : null}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-fg-subtle)" }}>
          --{token.key}
        </span>
      </div>
      {open ? (
        <ColorPopover
          tokenKey={token.key}
          scheme={scheme}
          current={display}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ColorPopover({
  tokenKey,
  scheme,
  current,
  onClose,
}: {
  tokenKey: ColorTokenKey;
  scheme: Scheme;
  current: string;
  onClose: () => void;
}) {
  const setOverride = useThemeStore((s) => s.setOverride);
  const resetToken = useThemeStore((s) => s.resetToken);
  const parsed = parseColor(current) ?? { kind: "hex" as const, value: "#000000" };
  // Scrim tokens are alpha-by-design; everything else is opaque by convention,
  // but a user-imported override may carry alpha — defer to the parsed form.
  const useAlpha = SCRIM_TOKEN_KEYS.has(tokenKey) || parsed.kind === "rgba";

  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    // Defer one frame so the click that opened the popover doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={popRef}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 4,
        zIndex: 100,
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule-strong)",
        boxShadow: "var(--shadow-pop)",
        padding: 10,
        borderRadius: 3,
      }}
    >
      {useAlpha ? (
        <RgbaColorPicker
          color={
            parsed.kind === "rgba"
              ? { r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.a }
              : (() => {
                  const h = toHex(parsed);
                  return {
                    r: parseInt(h.slice(1, 3), 16),
                    g: parseInt(h.slice(3, 5), 16),
                    b: parseInt(h.slice(5, 7), 16),
                    a: 1,
                  };
                })()
          }
          onChange={({ r, g, b, a }) =>
            setOverride(scheme, tokenKey, formatRgba(r, g, b, a))
          }
        />
      ) : (
        <HexColorPicker
          color={toHex(parsed)}
          onChange={(hex) => setOverride(scheme, tokenKey, hex.toLowerCase())}
        />
      )}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <code style={{ fontSize: 11, color: "var(--color-fg-muted)" }}>{current}</code>
        <button
          style={linkButtonStyle}
          onClick={() => {
            resetToken(scheme, tokenKey);
            onClose();
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/** Read the live CSS custom-property value off documentElement. Re-resolves
 *  whenever the active theme or scheme changes so the swatch reflects exactly
 *  what the cascade is rendering. The read is deferred via setTimeout so it
 *  runs *after* ThemeApplier (a parent component) has finished writing the
 *  new theme's inline styles — React fires child effects before parent
 *  effects, so a synchronous read here would catch the *previous* theme's
 *  values and the swatch would stay stuck on the old palette. */
function useEffectiveTokenValue(
  key: ColorTokenKey,
  theme: Theme,
  scheme: Scheme,
): string {
  const [value, setValue] = useState(() => readVar(key));
  useEffect(() => {
    const id = setTimeout(() => setValue(readVar(key)), 0);
    return () => clearTimeout(id);
  }, [key, theme, scheme]);
  return value;
}

function readVar(key: ColorTokenKey): string {
  if (typeof window === "undefined") return "";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${key}`)
    .trim();
  return v;
}

const buttonStyle: CSSProperties = {
  font: "inherit",
  fontSize: 13,
  padding: "4px 10px",
  background: "var(--color-bg)",
  color: "var(--color-fg)",
  border: "1px solid var(--color-rule-strong)",
  borderRadius: 2,
  cursor: "pointer",
};

const linkButtonStyle: CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--color-accent)",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};
