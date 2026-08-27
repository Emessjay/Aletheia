// Corpus pack status + install stubs for Tauri.

import { invoke } from "@tauri-apps/api/core";
import type { CorpusPackStatus } from "@/domain/corpusPacks";
import type { CorpusPacksAdapter } from "../types";

export const tauriCorpusPacks: CorpusPacksAdapter = {
  async list(): Promise<CorpusPackStatus[]> {
    return invoke<CorpusPackStatus[]>("corpus_packs_status");
  },
  async installFromPath(
    packId: string,
    sourcePath: string,
  ): Promise<CorpusPackStatus> {
    return invoke<CorpusPackStatus>("corpus_pack_install_from_path", {
      packId,
      sourcePath,
    });
  },
};
