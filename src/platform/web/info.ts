// Web implementation of PlatformInfo.
//
// In the browser build every "is this a desktop shell" flag is false by
// construction — there is no Tauri runtime, no native window, no per-OS
// behavior to gate. The selector in src/platform/index.ts only picks
// webPlatform when `__TAURI_INTERNALS__` is absent, so we don't probe the
// user-agent here.

import type { PlatformInfo } from "../types";

export const webInfo: PlatformInfo = {
  isDesktop: false,
  isMacDesktop: false,
  isWindowsDesktop: false,
  isIOSDesktop: false,
};
