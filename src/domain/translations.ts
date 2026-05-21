// Translation registry.
//
// Adding a new Bible translation should be a single edit here plus an ingest
// run — every consumer (settings UI, reader tabs, audio code, commentary
// cross-reference) reads from this registry instead of inlining the id. If
// you are adding a translation, update `TRANSLATIONS` below; nothing else in
// the TypeScript codebase should need to change.
//
// Rust-side parity: `src-tauri/src/audio.rs` validates against a small
// hardcoded set of audio translation ids. Rather than codegen a JSON file
// to share state between languages (which complicates the build), a Vitest
// test reads audio.rs as text and asserts the set matches
// `audioTranslations()`. If you flip `hasAudio` here, update the Rust
// matches!() arm too — the test will tell you which one.

import type { CorpusLanguage } from "@/db/types";

export type TranslationId = CorpusLanguage;

export interface Translation {
  id: TranslationId;
  /** Compact label for tight spaces — typically the abbreviation. */
  shortLabel: string;
  /** Full canonical title. */
  longLabel: string;
  language: "en" | "he" | "grc" | "la";
  direction: "ltr" | "rtl";
  hasStrongs: boolean;
  hasAudio: boolean;
  /** Marks the canonical English translation that commentary verse lookups
   *  cross-reference. Exactly one entry must set this true. */
  isCommentaryReference?: boolean;
  /** Surfaced in the Settings "Translations shown in the reader" toggles and
   *  rendered as a tab in the reader header. Excludes translations that are
   *  only reachable via fallback (en_web → BSB deuterocanon) or omitted from
   *  the primary UI (en_brenton, la). */
  isReaderTab: boolean;
  defaultOrder: number;
}

export const TRANSLATIONS: readonly Translation[] = [
  {
    id: "en_bsb",
    shortLabel: "English (Modern)",
    longLabel: "Berean Standard Bible",
    language: "en",
    direction: "ltr",
    hasStrongs: false,
    hasAudio: true,
    isReaderTab: true,
    defaultOrder: 10,
  },
  {
    id: "en_kjv",
    shortLabel: "English (King James)",
    longLabel: "King James Version",
    language: "en",
    direction: "ltr",
    hasStrongs: false,
    hasAudio: true,
    isCommentaryReference: true,
    isReaderTab: true,
    defaultOrder: 20,
  },
  {
    id: "gk",
    shortLabel: "Greek",
    longLabel: "Greek",
    language: "grc",
    direction: "ltr",
    hasStrongs: true,
    hasAudio: false,
    isReaderTab: true,
    defaultOrder: 30,
  },
  {
    id: "he",
    shortLabel: "Hebrew",
    longLabel: "Hebrew",
    language: "he",
    direction: "rtl",
    hasStrongs: true,
    hasAudio: false,
    isReaderTab: true,
    defaultOrder: 40,
  },
  {
    id: "en_brenton",
    shortLabel: "Brenton",
    longLabel: "Brenton English LXX",
    language: "en",
    direction: "ltr",
    hasStrongs: false,
    hasAudio: false,
    isReaderTab: false,
    defaultOrder: 50,
  },
  {
    id: "en_web",
    shortLabel: "WEB",
    longLabel: "World English Bible",
    language: "en",
    direction: "ltr",
    hasStrongs: false,
    hasAudio: true,
    isReaderTab: false,
    defaultOrder: 60,
  },
  {
    id: "la",
    shortLabel: "Latin",
    longLabel: "Latin",
    language: "la",
    direction: "ltr",
    hasStrongs: false,
    hasAudio: false,
    isReaderTab: false,
    defaultOrder: 70,
  },
];

const BY_ID: ReadonlyMap<TranslationId, Translation> = new Map(
  TRANSLATIONS.map((t) => [t.id, t]),
);

export function getTranslation(id: TranslationId): Translation | undefined {
  return BY_ID.get(id);
}

/** Compact label for the UI (reader pills, settings toggles, audio selector,
 *  search hits). Falls back to the raw id if the registry hasn't been updated
 *  yet — preferable to crashing the reader.
 *
 *  Reader pills and search rows both read `shortLabel`. For the four reader-tab
 *  translations this is the language-name form ("English (Modern)", "Hebrew",
 *  etc.); edition abbreviations remain available via `longLabel` if a surface
 *  ever wants them. */
export function translationShortLabel(id: TranslationId): string {
  return BY_ID.get(id)?.shortLabel ?? id;
}

export function translationsInOrder(): Translation[] {
  return [...TRANSLATIONS].sort((a, b) => a.defaultOrder - b.defaultOrder);
}

export function audioTranslations(): Translation[] {
  return translationsInOrder().filter((t) => t.hasAudio);
}

export function readerTabTranslations(): Translation[] {
  return translationsInOrder().filter((t) => t.isReaderTab);
}

const COMMENTARY_REFERENCE: Translation = (() => {
  const matches = TRANSLATIONS.filter((t) => t.isCommentaryReference);
  if (matches.length !== 1) {
    throw new Error(
      `translations registry: exactly one entry must set isCommentaryReference=true (found ${matches.length})`,
    );
  }
  return matches[0];
})();

export function commentaryReferenceTranslation(): Translation {
  return COMMENTARY_REFERENCE;
}
