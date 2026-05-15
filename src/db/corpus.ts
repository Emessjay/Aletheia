import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let corpusPromise: Promise<Database> | null = null;

export function corpus(): Promise<Database> {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      const path = await invoke<string>("corpus_db_path");
      // mode=ro is forwarded to sqlx → SQLite, which opens read-only and
      // skips creating -wal / -shm sidecars.
      return Database.load(`sqlite:${path}?mode=ro`);
    })();
  }
  return corpusPromise;
}

export async function corpusSelect<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await corpus();
  return db.select<T[]>(sql, params);
}

export async function corpusSelectOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await corpusSelect<T>(sql, params);
  return rows[0] ?? null;
}
