// First-run (and any later unset) prompt for Bible canon tradition. Blocks the
// rest of the shell until the user picks Protestant / Catholic / Orthodox —
// the choice only re-labels corpus deutero books as Deuterocanon vs Apocrypha.

import {
  CANON_TRADITIONS,
  CANON_TRADITION_META,
  type CanonTradition,
} from "@/domain/canonTradition";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function CanonOnboarding() {
  const canonTradition = useSettingsStore((s) => s.canonTradition);
  const setCanonTradition = useSettingsStore((s) => s.setCanonTradition);

  if (canonTradition !== null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="canon-onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 500,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-rule)",
          boxShadow: "var(--shadow-pop)",
          padding: "22px 24px 24px",
        }}
      >
        <p className="al-eyebrow" style={{ marginBottom: 6 }}>
          Welcome
        </p>
        <h1
          id="canon-onboarding-title"
          style={{
            fontSize: 24,
            fontStyle: "italic",
            margin: "0 0 10px",
            fontWeight: 400,
          }}
        >
          Choose a canon
        </h1>
        <p
          style={{
            color: "var(--color-fg-muted)",
            fontSize: 14,
            margin: "0 0 18px",
            lineHeight: 1.45,
          }}
        >
          This only changes how books outside the Protestant 66 are labeled —
          Deuterocanon or Apocrypha. You can change it later in Settings.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {CANON_TRADITIONS.map((id) => (
            <CanonChoice
              key={id}
              id={id}
              onPick={() => setCanonTradition(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CanonChoice({
  id,
  onPick,
}: {
  id: CanonTradition;
  onPick: () => void;
}) {
  const meta = CANON_TRADITION_META[id];
  return (
    <button
      type="button"
      className="al-tap"
      onClick={onPick}
      style={{
        textAlign: "left",
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule-strong)",
        padding: "12px 14px",
        cursor: "pointer",
        font: "inherit",
        color: "var(--color-fg)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {meta.label}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.4 }}>
        {meta.description}
      </div>
    </button>
  );
}
