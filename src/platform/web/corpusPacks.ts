// Web: packs are a desktop concern. Report everything installed so feature
// gates that consult the adapter do not hide web-supported surfaces. Web
// corpus trimming is handled separately in the Postgres ingest.

import type { CorpusPackStatus } from "@/domain/corpusPacks";
import { CORPUS_PACKS } from "@/domain/corpusPacks";
import type { CorpusPacksAdapter } from "../types";

export const webCorpusPacks: CorpusPacksAdapter = {
  async list(): Promise<CorpusPackStatus[]> {
    return CORPUS_PACKS.map((p) => ({
      id: p.id,
      installed: true,
      path: null,
      bytes: null,
      kind: p.kind,
    }));
  },
  async installFromPath(): Promise<CorpusPackStatus> {
    throw new Error("corpus packs are desktop-only");
  },
};
