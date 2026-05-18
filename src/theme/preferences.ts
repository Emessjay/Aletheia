/**
 * Async persistence for the theme store. Delegates to the platform's
 * PreferencesAdapter — today that's a JSON file under the platform's
 * app-config dir (Tauri); the upcoming web build will likely back it with
 * localStorage.
 *
 * localStorage stays in play here too as a synchronous cache: the store
 * hydrates from it instantly at startup so the first paint is correct,
 * while the async read runs in parallel and replaces in-memory state once
 * it lands. Writes go to both: the adapter's copy is the durable record,
 * localStorage keeps the next cold start fast.
 */
import { getPlatform } from "@/platform";
import type { PreferencesV1 } from "./types";

/** Read persisted preferences. Returns null on first launch (or when the
 *  adapter has nothing to return — e.g. the Vite-only preview running
 *  outside Tauri). */
export function readPreferencesFromDisk(): Promise<PreferencesV1 | null> {
  return getPlatform().preferences.read();
}

/** Persist preferences. Best-effort; the adapter logs on failure rather than
 *  throwing so a transient write error doesn't cascade through every theme
 *  edit. */
export function writePreferencesToDisk(prefs: PreferencesV1): Promise<void> {
  return getPlatform().preferences.write(prefs);
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
