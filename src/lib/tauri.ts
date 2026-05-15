// True when running inside the Tauri webview (vs. a plain `npm run dev` browser tab).
// __TAURI_INTERNALS__ is exposed by the Tauri runtime; the JS plugins fail without it.
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
