// Tauri implementation of CorpusAdapter.
//
// Bundled SQLite read-only access. The Rust side resolves the absolute path
// to the corpus database (which lives in the app bundle's resources, not in
// user-writable storage) via the `corpus_db_path` command; opening with
// `mode=ro` skips creating -wal/-shm sidecars next to the read-only file.

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { CorpusAdapter } from "../types";

let corpusPromise: Promise<Database> | null = null;

function corpusDb(): Promise<Database> {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      const path = await invoke<string>("corpus_db_path");
      return Database.load(`sqlite:${path}?mode=ro`);
    })();
  }
  return corpusPromise;
}

export const tauriCorpus: CorpusAdapter = {
  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await corpusDb();
    return db.select<T[]>(sql, params);
  },
  async selectOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const db = await corpusDb();
    const rows = await db.select<T[]>(sql, params);
    return rows[0] ?? null;
  },
};
