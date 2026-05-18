// Read-only better-sqlite3 wrapper for the bundled corpus.
//
// The desktop build talks to SQLite directly through the Tauri plugin; the
// web build proxies the same SQL through the /api/corpus routes in this
// server. Both code paths see an identical CorpusAdapter shape, so feature
// code on the frontend doesn't care which one it's running against.
//
// SQL is accepted verbatim from the frontend. That is safe here because:
//   1. the handle is opened readonly — a runaway UPDATE/DELETE will throw
//      before touching disk;
//   2. only public-domain biblical text lives in the DB, so an exfiltration
//      "attack" amounts to a download of files the user could already fetch
//      from the source repos;
//   3. row/byte caps in callRows below prevent a `SELECT *` from a verses
//      table OOM'ing the Railway dyno.

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";

const MAX_ROWS = 50_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class QueryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface CorpusHandle {
  path: string;
  db: DB;
  select<T = unknown>(sql: string, params?: unknown[]): T[];
  selectOne<T = unknown>(sql: string, params?: unknown[]): T | null;
  close(): void;
}

export function openCorpus(corpusPath: string): CorpusHandle {
  const db = new Database(corpusPath, { readonly: true, fileMustExist: true });
  // No journal_mode pragma here: changing it requires a write transaction,
  // which a readonly handle refuses. The ingest pipeline writes the DB in
  // WAL mode and that setting is persistent, so readers pick it up
  // automatically.

  function prepare(sql: string) {
    rejectMultiStatement(sql);
    return db.prepare(sql);
  }

  return {
    path: corpusPath,
    db,
    select<T = unknown>(sql: string, params: unknown[] = []): T[] {
      const stmt = prepare(sql);
      const rows = stmt.all(...(params as never[])) as T[];
      enforceCaps(rows);
      return rows;
    },
    selectOne<T = unknown>(sql: string, params: unknown[] = []): T | null {
      const stmt = prepare(sql);
      const row = stmt.get(...(params as never[])) as T | undefined;
      return row ?? null;
    },
    close() {
      db.close();
    },
  };
}

// Defensive belt-and-braces. better-sqlite3's .prepare() compiles only the
// first statement and ignores trailing ones, so multi-statement injection is
// already a no-op — but rejecting at the door produces a clearer 400 than
// "syntax error near ';'" from the SQLite driver, and removes any doubt for
// future readers about whether the surface is exploitable.
function rejectMultiStatement(sql: string): void {
  if (typeof sql !== "string" || sql.length === 0) {
    throw new QueryError("sql must be a non-empty string", 400);
  }
  if (sql.length > 16_000) {
    throw new QueryError("sql exceeds 16 KiB limit", 413);
  }
  // Strip string literals before scanning for `;` so a verse text containing
  // a semicolon (e.g. as a bind parameter literal) doesn't trip the check.
  // Note: bind parameters travel as `?` placeholders, so the only place a
  // semicolon legitimately appears in the SQL itself is inside a string
  // literal — and we tolerate those.
  const stripped = sql
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
  if (stripped.includes(";")) {
    throw new QueryError(
      "sql must not contain ';' (multi-statement queries are not allowed)",
      400,
    );
  }
}

function enforceCaps(rows: unknown[]): void {
  if (rows.length > MAX_ROWS) {
    throw new QueryError(
      `result exceeds ${MAX_ROWS}-row cap (${rows.length} rows)`,
      413,
    );
  }
  // JSON serialization cost is paid once here so we can reject before
  // streaming a 200 with a multi-megabyte body. The serialized form is also
  // what Express will send, so this measures the real wire size.
  const json = JSON.stringify(rows);
  if (json.length > MAX_RESPONSE_BYTES) {
    throw new QueryError(
      `result exceeds ${MAX_RESPONSE_BYTES}-byte cap (${json.length} bytes)`,
      413,
    );
  }
}
