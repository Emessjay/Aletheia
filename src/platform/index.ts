// Public entry point for the platform-adapter layer.
//
// Feature code calls getPlatform() instead of reaching into `@tauri-apps/*`
// or `fetch("/api/...")` directly. The selector picks the desktop adapter
// when Tauri's runtime is present and the web adapter otherwise — detection
// is purely runtime so a single Vite bundle can serve both hosts.

import { tauriPlatform } from "./tauri";
import { webPlatform } from "./web";
import type { Platform } from "./types";

export type {
  AudioAdapter,
  AudioSourcePath,
  CorpusAdapter,
  Platform,
  PlatformInfo,
  PreferencesAdapter,
  UserDataAdapter,
} from "./types";

let cached: Platform | null = null;

export function getPlatform(): Platform {
  if (cached) return cached;
  // Tauri injects `__TAURI_INTERNALS__` on `window` before our code runs;
  // its presence is the canonical "am I in a Tauri webview" probe. In a
  // plain browser the property is absent, so we hand back the web adapter.
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  cached = isTauri ? tauriPlatform : webPlatform;
  return cached;
}
