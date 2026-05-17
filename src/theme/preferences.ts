/**
 * Async persistence for the theme store, backed by a JSON file under the
 * platform's app config directory (on macOS: `~/Library/Application
 * Support/<bundle-id>/preferences.json`). The file is user-readable so
 * themes can be hand-edited, shared, or version-controlled.
 *
 * localStorage stays in play as a synchronous cache: the store hydrates from
 * it instantly at startup so the first paint is correct, while an async
 * disk read runs in parallel and replaces in-memory state once it lands.
 * Writes go to both: the disk copy is the durable record, localStorage
 * keeps the next cold start fast.
 *
 * When running outside Tauri (e.g. `npm run dev` in a plain browser), disk
 * I/O is a no-op and localStorage is the only backend — useful for the
 * Vite-only preview that the design tab uses during component work.
 */
import { isTauri } from "@/lib/tauri";
import type { PreferencesV1 } from "./types";

const FILE = "preferences.json";

interface FsModule {
  readTextFile: (
    path: string,
    opts?: { baseDir?: number },
  ) => Promise<string>;
  writeTextFile: (
    path: string,
    contents: string,
    opts?: { baseDir?: number },
  ) => Promise<void>;
  exists: (path: string, opts?: { baseDir?: number }) => Promise<boolean>;
  mkdir: (
    path: string,
    opts?: { baseDir?: number; recursive?: boolean },
  ) => Promise<void>;
  BaseDirectory: { AppConfig: number };
}

let fsModulePromise: Promise<FsModule | null> | null = null;
function getFs(): Promise<FsModule | null> {
  if (!isTauri()) return Promise.resolve(null);
  if (!fsModulePromise) {
    // Dynamic import so the bundler doesn't pull plugin-fs into the non-Tauri
    // build path (Vite preview, vitest jsdom environment).
    fsModulePromise = import("@tauri-apps/plugin-fs")
      .then((m) => m as unknown as FsModule)
      .catch((err) => {
        console.warn("plugin-fs unavailable, falling back to localStorage", err);
        return null;
      });
  }
  return fsModulePromise;
}

/** Read the preferences file. Returns null if the file doesn't exist or is
 *  unreadable — the caller should treat that as "first launch" and fall back
 *  to in-memory defaults / localStorage migration. */
export async function readPreferencesFromDisk(): Promise<PreferencesV1 | null> {
  const fs = await getFs();
  if (!fs) return null;
  try {
    const exists = await fs.exists(FILE, { baseDir: fs.BaseDirectory.AppConfig });
    if (!exists) return null;
    const text = await fs.readTextFile(FILE, {
      baseDir: fs.BaseDirectory.AppConfig,
    });
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "$schema" in parsed &&
      (parsed as { $schema: unknown }).$schema === 1
    ) {
      return parsed as PreferencesV1;
    }
    console.warn("preferences.json has unexpected shape, ignoring");
    return null;
  } catch (err) {
    console.warn("could not read preferences.json", err);
    return null;
  }
}

/** Write the preferences file atomically (well, as atomically as plugin-fs
 *  exposes — single writeTextFile call, no temp+rename). Best-effort; logs
 *  on failure rather than throwing, so a transient write error doesn't
 *  cascade through every theme edit. */
export async function writePreferencesToDisk(prefs: PreferencesV1): Promise<void> {
  const fs = await getFs();
  if (!fs) return;
  try {
    // Ensure the AppConfig dir exists. mkdir is allowed to fail silently if
    // the directory is already there (the plugin's recursive flag handles
    // that for us, but older runtimes throw on EEXIST, so swallow).
    try {
      await fs.mkdir("", {
        baseDir: fs.BaseDirectory.AppConfig,
        recursive: true,
      });
    } catch {
      /* directory likely already exists */
    }
    await fs.writeTextFile(FILE, JSON.stringify(prefs, null, 2) + "\n", {
      baseDir: fs.BaseDirectory.AppConfig,
    });
  } catch (err) {
    console.warn("could not write preferences.json", err);
  }
}

/** Coalesce a flurry of writes (e.g. while a user drags a color picker) into
 *  a single disk write after `delayMs` of quiescence. The returned function
 *  has a `.flush()` method that fires any pending write immediately — call it
 *  on `pagehide` so edits made in the last `delayMs` aren't lost when the
 *  user closes the app. */
export interface DebouncedWriter {
  (prefs: PreferencesV1): void;
  flush: () => void;
}

export function makeDebouncedWriter(delayMs = 200): DebouncedWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: PreferencesV1 | null = null;
  const fn = ((prefs: PreferencesV1) => {
    latest = prefs;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (latest) void writePreferencesToDisk(latest);
      timer = null;
      latest = null;
    }, delayMs);
  }) as DebouncedWriter;
  fn.flush = () => {
    if (timer) clearTimeout(timer);
    if (latest) void writePreferencesToDisk(latest);
    timer = null;
    latest = null;
  };
  return fn;
}
