// Tauri implementation of UserDataAdapter.
//
// User annotations (highlights, notes, bookmarks, libraries, kv) live in a
// read/write SQLite database under the app's data dir, opened via
// tauri-plugin-sql. The adapter exposes only the SQL primitives used by
// `src/db/user.ts` — the higher-level CRUD helpers stay where they are.

import Database from "@tauri-apps/plugin-sql";
import type { UserDataAdapter } from "../types";

const USER_DB_URL = "sqlite:aletheia_user.db";

let userPromise: Promise<Database> | null = null;

function userDb(): Promise<Database> {
  if (!userPromise) {
    userPromise = Database.load(USER_DB_URL);
  }
  return userPromise;
}

export const tauriUserData: UserDataAdapter = {
  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await userDb();
    return db.select<T[]>(sql, params);
  },
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const db = await userDb();
    await db.execute(sql, params);
  },
};
