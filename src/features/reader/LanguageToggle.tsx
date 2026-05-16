import { useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { TRANSLATION_LABELS } from "@/domain/translations";
import type { CorpusLanguage } from "@/db/types";

export function LanguageToggle() {
  const active = useSettingsStore((s) => s.activeTranslations);
  const toggle = useSettingsStore((s) => s.toggleTranslation);
  const tabOrder = useSettingsStore((s) => s.tabOrder);
  const setTabOrder = useSettingsStore((s) => s.setTabOrder);

  const [draggingLang, setDraggingLang] = useState<CorpusLanguage | null>(null);
  const [dropTargetLang, setDropTargetLang] = useState<CorpusLanguage | null>(
    null,
  );

  function moveTo(src: CorpusLanguage, dst: CorpusLanguage) {
    if (src === dst) return;
    const srcIdx = tabOrder.indexOf(src);
    const dstIdx = tabOrder.indexOf(dst);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = tabOrder.filter((l) => l !== src);
    const newDstIdx = next.indexOf(dst);
    // Dragging forward (left→right) lands after the target; dragging backward
    // lands before. This lets a tab reach any position, including the ends.
    const insertAt = srcIdx < dstIdx ? newDstIdx + 1 : newDstIdx;
    next.splice(insertAt, 0, src);
    setTabOrder(next);
  }

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
      {tabOrder.map((lang) => {
        const on = active.includes(lang);
        const isDragging = draggingLang === lang;
        const isDropTarget = dropTargetLang === lang && draggingLang !== lang;
        // Indicator side mirrors where the drop will land relative to this tab.
        const dropAfter =
          isDropTarget &&
          draggingLang !== null &&
          tabOrder.indexOf(draggingLang) < tabOrder.indexOf(lang);
        return (
          <button
            key={lang}
            type="button"
            draggable
            onClick={() => toggle(lang)}
            onDragStart={(e) => {
              setDraggingLang(lang);
              e.dataTransfer.effectAllowed = "move";
              // Firefox needs data to be set to initiate a drag.
              e.dataTransfer.setData("text/plain", lang);
            }}
            onDragEnter={() => {
              if (draggingLang && draggingLang !== lang) {
                setDropTargetLang(lang);
              }
            }}
            onDragOver={(e) => {
              if (draggingLang) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDragLeave={() => {
              setDropTargetLang((cur) => (cur === lang ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingLang && draggingLang !== lang) {
                moveTo(draggingLang, lang);
              }
              setDraggingLang(null);
              setDropTargetLang(null);
            }}
            onDragEnd={() => {
              setDraggingLang(null);
              setDropTargetLang(null);
            }}
            style={{
              background: "transparent",
              border: 0,
              padding: "2px 0",
              font: "inherit",
              fontSize: 14,
              cursor: isDragging ? "grabbing" : "pointer",
              color: on ? "var(--color-fg)" : "var(--color-fg-subtle)",
              borderBottom: on
                ? "1px solid var(--color-accent)"
                : "1px solid transparent",
              boxShadow: isDropTarget
                ? dropAfter
                  ? "6px 0 0 -3px var(--color-accent)"
                  : "-6px 0 0 -3px var(--color-accent)"
                : "none",
              opacity: isDragging ? 0.4 : 1,
              transition: "opacity 80ms",
            }}
          >
            {TRANSLATION_LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}
