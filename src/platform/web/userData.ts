// Web implementation of UserDataAdapter.
//
// Highlights, notes, bookmarks, libraries and the kv table all live
// client-side: the Wave 3a Node server exposes no user-data endpoints, in
// keeping with the project's local-first ethos (no auth, no shared state,
// no cross-device sync). The browser becomes the single source of truth
// per device — mirroring how the Tauri build already works.
//
// Implementation: sql.js (SQLite compiled to WebAssembly) backed by
// IndexedDB. We considered re-routing each SQL string from src/db/user.ts
// to an IndexedDB transaction, but the SQL contracts are stable enough
// that a real SQLite engine pays for itself: the same SQL runs unchanged
// on desktop (plugin-sql) and web (sql.js), so feature code stays
// platform-agnostic and schema migrations stay declarative.
//
// Cost: sql.js is roughly ~600 KB gzipped of WASM, fetched once. The
// blob is cached in IndexedDB after every write so the next page load
// rehydrates without losing data. Writes are issued synchronously to
// sql.js, then the exported byte array is persisted asynchronously; the
// Promise the adapter returns awaits the persistence step so callers
// cannot race a refresh against a half-saved write.
//
// SQL dialect: src/db/user.ts writes parameters as `$1, $2, …` (sqlx /
// Postgres syntax that plugin-sql translates for us). sql.js sees
// SQLite directly, so we rewrite `$N` to `?N` (numbered positional
// placeholders that SQLite accepts and that handle the duplicate-bind
// case in createHighlight's `VALUES (…, $10, $10)`).

import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import schemaSql from "@/db/schema.sql?raw";
import migration0002Sql from "@/db/migrations/0002_per_side_annotations.sql?raw";
import type { UserDataAdapter } from "../types";

type SqlJsStatic = initSqlJs.SqlJsStatic;
type Database = initSqlJs.Database;
type BindParams = initSqlJs.BindParams;

const IDB_NAME = "aletheia-user";
const IDB_STORE = "db";
const IDB_KEY = "blob";
const SCHEMA_VERSION = 2;

// Rewrite Postgres-style `$N` placeholders into SQLite's `?N` form. Done
// once per SQL string and cached, because the SQL literals in user.ts are
// finite and reused on every keystroke through some flows (notes editor).
const placeholderCache = new Map<string, string>();
function toSqliteSql(sql: string): string {
  const cached = placeholderCache.get(sql);
  if (cached !== undefined) return cached;
  const out = sql.replace(/\$(\d+)/g, "?$1");
  placeholderCache.set(sql, out);
  return out;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return sqlJsPromise;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function loadBlob(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => {
      const v = req.result;
      if (v instanceof Uint8Array) resolve(v);
      else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v));
      else resolve(null);
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
    tx.oncomplete = () => idb.close();
  });
}

async function saveBlob(blob: Uint8Array): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB tx aborted"));
  });
}

function currentSchemaVersion(db: Database): number {
  const stmt = db.prepare("PRAGMA user_version");
  try {
    stmt.step();
    const v = stmt.get()[0];
    return typeof v === "number" ? v : 0;
  } finally {
    stmt.free();
  }
}

function runMigrations(db: Database): boolean {
  const version = currentSchemaVersion(db);
  if (version >= SCHEMA_VERSION) return false;
  if (version < 1) {
    db.exec(schemaSql);
  }
  if (version < 2) {
    db.exec(migration0002Sql);
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return true;
}

let dbPromise: Promise<Database> | null = null;
function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await getSqlJs();
      const blob = await loadBlob().catch((err) => {
        console.warn("could not read user db from IndexedDB", err);
        return null;
      });
      const db = new SQL.Database(blob ?? undefined);
      const changed = runMigrations(db);
      if (changed) {
        await saveBlob(db.export()).catch((err) =>
          console.warn("could not persist user db after migration", err),
        );
      }
      return db;
    })();
  }
  return dbPromise;
}

async function persist(db: Database): Promise<void> {
  try {
    await saveBlob(db.export());
  } catch (err) {
    console.warn("could not persist user db to IndexedDB", err);
  }
}

export const webUserData: UserDataAdapter = {
  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await getDb();
    const stmt = db.prepare(toSqliteSql(sql));
    try {
      stmt.bind(params as BindParams);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as unknown as T);
      return out;
    } finally {
      stmt.free();
    }
  },
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const db = await getDb();
    db.run(toSqliteSql(sql), params as BindParams);
    await persist(db);
  },
};
