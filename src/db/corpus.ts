// Thin wrapper over the platform's CorpusAdapter. Kept as a separate module
// (rather than deleted) because queries.ts calls corpusSelect/corpusSelectOne
// in ~30 places — re-routing them via this file leaves those call sites
// untouched while still funneling every corpus read through the adapter.

import { getPlatform } from "@/platform";

export function corpusSelect<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return getPlatform().corpus.select<T>(sql, params);
}

export function corpusSelectOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  return getPlatform().corpus.selectOne<T>(sql, params);
}
