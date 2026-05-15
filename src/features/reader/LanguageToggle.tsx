import { useSettingsStore } from "@/stores/useSettingsStore";
import { TRANSLATION_LABELS } from "@/domain/translations";
import type { CorpusLanguage } from "@/db/types";

const ORDER: CorpusLanguage[] = ["en_bsb", "en_kjv", "gk", "he"];

export function LanguageToggle() {
  const active = useSettingsStore((s) => s.activeTranslations);
  const toggle = useSettingsStore((s) => s.toggleTranslation);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "baseline",
        flexWrap: "wrap",
        padding: "0 0 1rem",
        marginBottom: "1.5rem",
        borderBottom: "1px solid var(--color-rule)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
        }}
      >
        Translations
      </span>
      {ORDER.map((lang) => {
        const on = active.includes(lang);
        return (
          <button
            key={lang}
            type="button"
            onClick={() => toggle(lang)}
            style={{
              background: "transparent",
              border: 0,
              padding: "2px 0",
              font: "inherit",
              fontSize: 14,
              cursor: "pointer",
              color: on ? "var(--color-fg)" : "var(--color-fg-subtle)",
              borderBottom: on
                ? "1px solid var(--color-accent)"
                : "1px solid transparent",
            }}
          >
            {TRANSLATION_LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}
