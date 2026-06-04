import { useEffect, useRef, useState } from "react";
import { resolveTheme, useSettingsStore, type ThemeMode } from "@/stores/useSettingsStore";

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const resolved = resolveTheme(theme);
  const next: ThemeMode = resolved === "dark" ? "light" : "dark";

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title={`Theme: ${theme}`}
        onClick={() => setTheme(next)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen((o) => !o);
        }}
        style={{
          background: "transparent",
          border: 0,
          color: "var(--color-fg-muted)",
          cursor: "pointer",
          // Padded hit area (~42px) with negative margin so the visual
          // footprint in the header stays the same as the old 4px/6px.
          padding: "13px 12px",
          margin: "-9px -6px",
          display: "inline-flex",
          alignItems: "center",
          lineHeight: 0,
        }}
      >
        {resolved === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>
      {menuOpen ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 140,
            background: "var(--color-bg)",
            border: "1px solid var(--color-rule-strong)",
            borderRadius: 3,
            boxShadow: "var(--shadow-pop)",
            padding: "4px 0",
            zIndex: 100,
          }}
        >
          {(["light", "dark", "system"] as ThemeMode[]).map((opt) => (
            <button
              key={opt}
              role="menuitemradio"
              aria-checked={theme === opt}
              onClick={() => {
                setTheme(opt);
                setMenuOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: 0,
                padding: "10px 14px",
                color: "var(--color-fg)",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              <span style={{ color: theme === opt ? "var(--color-accent)" : "inherit" }}>
                {theme === opt ? "· " : "  "}
              </span>
              {opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
    </svg>
  );
}
