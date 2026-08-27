import type { CorpusPackId } from "./corpusPacks";

/** URL path prefix for the Resources tab (formerly Patristics). */
export const RESOURCES_BASE = "/resources";

/**
 * Pack-scoped corpora shown on the Resources landing. Slug predicates mirror
 * `scripts/split-corpus-packs.py` (ANF/NPNF/reformers shards + base
 * summa/creeds).
 */
export type ResourcesCorpusId = "anf" | "npnf" | "reformers" | "base";

export interface ResourcesCorpusMeta {
  id: ResourcesCorpusId;
  /** Pack that must be installed for this category to appear. */
  packId: CorpusPackId;
  title: string;
  description: string;
}

export const RESOURCES_CORPORA: readonly ResourcesCorpusMeta[] = [
  {
    id: "anf",
    packId: "anf",
    title: "Ante-Nicene Fathers",
    description: "Schaff ANF volumes (Roberts & Donaldson).",
  },
  {
    id: "npnf",
    packId: "npnf",
    title: "Nicene and Post-Nicene Fathers",
    description: "Schaff NPNF Series 1 & 2.",
  },
  {
    id: "reformers",
    packId: "reformers",
    title: "Reformers",
    description: "Luther, Calvin, Knox, and Latimer treatises.",
  },
  {
    id: "base",
    packId: "base",
    title: "Summa & Creeds",
    description: "Aquinas’s Summa Theologica and the historic creeds.",
  },
] as const;

const REFORMER_PREFIX = /^(luther_|calvin_|knox_|latimer_)/;

/** Whether a work slug belongs to the given Resources corpus. */
export function workMatchesCorpus(
  slug: string,
  corpus: ResourcesCorpusId,
): boolean {
  switch (corpus) {
    case "anf":
      return slug.startsWith("anf");
    case "npnf":
      return slug.startsWith("npnf");
    case "reformers":
      return REFORMER_PREFIX.test(slug);
    case "base":
      return slug === "summa" || slug.startsWith("creeds");
  }
}

export function resourcesCorpusMeta(
  id: string,
): ResourcesCorpusMeta | undefined {
  return RESOURCES_CORPORA.find((c) => c.id === id);
}

export function isResourcesCorpusId(id: string): id is ResourcesCorpusId {
  return RESOURCES_CORPORA.some((c) => c.id === id);
}

/** Which Resources landing category a work slug belongs to, if any. */
export function corpusIdForWork(slug: string): ResourcesCorpusId | null {
  for (const corpus of RESOURCES_CORPORA) {
    if (workMatchesCorpus(slug, corpus.id)) return corpus.id;
  }
  return null;
}
