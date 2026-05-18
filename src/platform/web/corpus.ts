// Web implementation of CorpusAdapter.
//
// HTTP shim over the Wave 3a Node server. The server exposes the same
// `{ sql, params }` shape that the Tauri plugin-sql accepts and returns
// `{ rows }` / `{ row }` — so feature code that already runs through the
// adapter sees identical row shapes. Errors from non-2xx responses are
// surfaced as thrown Error instances; callers (mostly react-query)
// already know how to display those.
//
// No in-flight caching here: react-query wraps every corpus read in
// the UI layer, so duplicate requests get deduped one level up.

import type { CorpusAdapter } from "../types";

interface SelectResponse<T> {
  rows: T[];
}
interface SelectOneResponse<T> {
  row: T | null;
}
interface ErrorResponse {
  error?: string;
}

async function postCorpus<R>(
  endpoint: "select" | "selectOne",
  sql: string,
  params: unknown[],
): Promise<R> {
  const res = await fetch(`/api/corpus/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as ErrorResponse;
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // Body was not JSON; the status line is the best we have.
    }
    throw new Error(`/api/corpus/${endpoint}: ${message}`);
  }
  return (await res.json()) as R;
}

export const webCorpus: CorpusAdapter = {
  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const body = await postCorpus<SelectResponse<T>>("select", sql, params);
    return body.rows;
  },
  async selectOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const body = await postCorpus<SelectOneResponse<T>>(
      "selectOne",
      sql,
      params,
    );
    return body.row;
  },
};
