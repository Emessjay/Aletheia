import { isTauri } from "./tauri";

export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // navigator.platform is deprecated but still reliable inside Tauri's WKWebView.
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

export function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Win/i.test(navigator.platform);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.platform);
}

export function isMacDesktopTauri(): boolean {
  return isTauri() && isMacOS() && !isIOS();
}

export function isWindowsTauri(): boolean {
  return isTauri() && isWindows();
}

export function isIOSTauri(): boolean {
  return isTauri() && isIOS();
}
