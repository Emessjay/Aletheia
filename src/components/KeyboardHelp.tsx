interface Props {
  open: boolean;
  onClose: () => void;
}

const ROWS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["["], label: "Previous chapter" },
  { keys: ["]"], label: "Next chapter" },
  { keys: ["g", "r"], label: "Go to reader" },
  { keys: ["g", "p"], label: "Go to patristics" },
  { keys: ["g", "l"], label: "Go to libraries" },
  { keys: ["g", "s"], label: "Go to settings" },
  { keys: ["Esc"], label: "Close popover / palette / help" },
];

export function KeyboardHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(0 0 0 / 0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 400,
      }}
    >
      <div
        style={{
          width: "min(440px, 92vw)",
          background: "var(--color-bg)",
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 3,
          boxShadow: "var(--shadow-pop)",
          padding: "20px 22px",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="al-eyebrow" style={{ marginBottom: "0.75rem" }}>
          Keyboard
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {ROWS.map((r, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "6px 0",
                borderTop: i > 0 ? "1px solid var(--color-rule)" : 0,
              }}
            >
              <span style={{ display: "inline-flex", gap: 4, minWidth: 90 }}>
                {r.keys.map((k) => (
                  <kbd
                    key={k}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      padding: "1px 6px",
                      border: "1px solid var(--color-rule-strong)",
                      borderRadius: 2,
                      color: "var(--color-fg-muted)",
                      background: "var(--color-bg-inset)",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span style={{ color: "var(--color-fg)", fontSize: 14 }}>{r.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
