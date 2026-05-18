// Tauri implementation of PreferencesAdapter.
//
// Preferences live in a JSON file under the platform's app-config dir
// (on macOS: `~/Library/Application Support/<bundle-id>/preferences.json`).
// The file is user-readable so themes can be hand-edited, shared, or
// version-controlled. plugin-fs is dynamically imported so the bundler
// doesn't pull it into non-Tauri code paths (Vite preview, vitest jsdom).

import type { PreferencesV1 } from "@/theme/types";
import type { PreferencesAdapter } from "../types";
import { tauriInfo } from "./info";

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
  if (!tauriInfo.isDesktop) return Promise.resolve(null);
  if (!fsModulePromise) {
    fsModulePromise = import("@tauri-apps/plugin-fs")
      .then((m) => m as unknown as FsModule)
      .catch((err) => {
        console.warn("plugin-fs unavailable, falling back to localStorage", err);
        return null;
      });
  }
  return fsModulePromise;
}

export const tauriPreferences: PreferencesAdapter = {
  async read(): Promise<PreferencesV1 | null> {
    const fs = await getFs();
    if (!fs) return null;
    try {
      const exists = await fs.exists(FILE, {
        baseDir: fs.BaseDirectory.AppConfig,
      });
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
  },
  async write(prefs: PreferencesV1): Promise<void> {
    const fs = await getFs();
    if (!fs) return;
    try {
      // mkdir is best-effort: older runtimes throw on EEXIST even with
      // recursive, newer ones treat it as a no-op.
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
  },
};
