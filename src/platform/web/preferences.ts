// Web implementation of PreferencesAdapter.
//
// Preferences live in `localStorage` under a single key. The blob is small
// (a JSON theme map; a typical user has under a dozen themes), well under
// the ~5 MB per-origin localStorage quota, so we don't bother sharding
// across keys. Reads and writes are synchronous in the platform sense
// but presented as Promises to match the interface.
//
// Errors (private-mode browsers that throw on `setItem`, malformed JSON
// from a hand-edited entry) are logged and swallowed — same posture as
// the Tauri side, where a transient FS error doesn't crash the editor.

import type { PreferencesV1 } from "@/theme/types";
import type { PreferencesAdapter } from "../types";

const STORAGE_KEY = "aletheia.preferences.v1";

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Some embedded browsers throw on `window.localStorage` access.
    return null;
  }
}

export const webPreferences: PreferencesAdapter = {
  async read(): Promise<PreferencesV1 | null> {
    const storage = getStorage();
    if (!storage) return null;
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn("could not read preferences from localStorage", err);
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "$schema" in parsed &&
        (parsed as { $schema: unknown }).$schema === 1
      ) {
        return parsed as PreferencesV1;
      }
      console.warn("preferences in localStorage has unexpected shape, ignoring");
      return null;
    } catch (err) {
      console.warn("could not parse preferences from localStorage", err);
      return null;
    }
  },

  async write(prefs: PreferencesV1): Promise<void> {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.warn("could not write preferences to localStorage", err);
    }
  },
};
