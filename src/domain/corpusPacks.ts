// Desktop corpus content packs.
//
// The Tauri base install ships Bibles + Strong's lexicon + Summa/Creeds.
// Optional shards (interlinear word rows, commentaries, ANF, NPNF, reformers)
// and the Modern English audio pack (timing + prepackaged MP3s) are separate.
// Web ignores this registry — it trims corpus via Postgres ingest instead.

export type CorpusPackId =
  | "base"
  | "interlinear"
  | "commentaries"
  | "anf"
  | "npnf"
  | "reformers"
  | "audio-modern-en";

export type CorpusPackKind = "base" | "sqlite" | "marker";

export interface CorpusPackMeta {
  id: CorpusPackId;
  title: string;
  description: string;
  kind: CorpusPackKind;
  /** Main-nav tab ids that should hide when this pack is absent (desktop). */
  gatesTabs?: ReadonlyArray<"commentaries" | "patristics">;
}

/**
 * Strong's *lexicon* (`strongs` table) stays in base (~3 MiB) so definition
 * popovers work whenever a Strong's id is known. The Interlinear pack is the
 * heavy `word` table (~100 MiB) that powers Hebrew/Greek word columns and
 * stacked interlinear glosses. English BSB/KJV verses do not embed Strong's
 * ids today (`hasStrongs: false`), so without the Interlinear pack the reader
 * still shows plain Hebrew/Greek verse text from base — only token-level
 * interlinear / clickable Strong's surfaces are missing.
 */
export const CORPUS_PACKS: readonly CorpusPackMeta[] = [
  {
    id: "base",
    title: "Base corpus",
    description:
      "Core Bible texts, Strong's lexicon definitions, cross-references, Summa, and Creeds.",
    kind: "base",
  },
  {
    id: "interlinear",
    title: "Interlinear",
    description:
      "Word-level Hebrew/Greek rows (Strong's ids, morphology, glosses) for interlinear columns.",
    kind: "sqlite",
  },
  {
    id: "commentaries",
    title: "Commentaries",
    description:
      "Matthew Henry, Calvin, JFB, Wesley, Clarke, and Luther biblical commentaries.",
    kind: "sqlite",
    gatesTabs: ["commentaries"],
  },
  {
    id: "anf",
    title: "Ante-Nicene Fathers",
    description: "Schaff ANF volumes (Roberts & Donaldson).",
    kind: "sqlite",
  },
  {
    id: "npnf",
    title: "Nicene and Post-Nicene Fathers",
    description: "Schaff NPNF Series 1 & 2.",
    kind: "sqlite",
  },
  {
    id: "reformers",
    title: "Reformers",
    description:
      "Luther, Calvin, Knox, and Latimer non-commentary treatises (pipeline group reformers).",
    kind: "sqlite",
  },
  {
    id: "audio-modern-en",
    title: "Audio (Modern English)",
    description:
      "Prepackaged BSB / KJV / WEB narration MP3s (plus timing metadata). Plays offline when the pack includes audio files.",
    kind: "marker",
  },
] as const;

export interface CorpusPackStatus {
  id: string;
  installed: boolean;
  path?: string | null;
  bytes?: number | null;
  kind: string;
}

export function packMeta(id: string): CorpusPackMeta | undefined {
  return CORPUS_PACKS.find((p) => p.id === id);
}

/** Tabs that require a specific pack on desktop. Patristics stays visible
 *  whenever base is present (Summa/Creeds); ANF/NPNF/Reformers filter inside. */
export function tabRequiresPack(tabId: string): CorpusPackId | null {
  if (tabId === "commentaries") return "commentaries";
  return null;
}

export function formatPackBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(0)} KiB`;
}
