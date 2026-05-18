// Tauri implementation of PlatformInfo.
//
// `__TAURI_INTERNALS__` is exposed by the Tauri runtime on the global window;
// its presence is the canonical "am I in a Tauri webview" probe (the JS
// plugins fail without it). `navigator.platform` is deprecated in browsers
// but still reliable inside Tauri's WKWebView and is the path we already
// relied on for OS detection.

import type { PlatformInfo } from "../types";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function uaIsMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

function uaIsWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Win/i.test(navigator.platform);
}

function uaIsIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.platform);
}

const desktop = hasTauriRuntime();

export const tauriInfo: PlatformInfo = {
  isDesktop: desktop,
  isMacDesktop: desktop && uaIsMacOS() && !uaIsIOS(),
  isWindowsDesktop: desktop && uaIsWindows(),
  isIOSDesktop: desktop && uaIsIOS(),
};
