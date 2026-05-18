// Public entry point for the platform-adapter layer.
//
// Feature code should call getPlatform() (or import a specific adapter
// re-export) instead of reaching into `@tauri-apps/*`. Wave 3 will add a
// `web/` sibling directory and a selector here that returns the web
// platform when `info.isDesktop` would be false; until then there is only
// one implementation.

import { tauriPlatform } from "./tauri";
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

export function getPlatform(): Platform {
  return tauriPlatform;
}
