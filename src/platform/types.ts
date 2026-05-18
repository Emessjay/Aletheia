// Platform-adapter interface definitions.
//
// Aletheia talks to its host environment (today: Tauri desktop; soon: a
// browser-deployable Railway build) through these adapters. Feature code
// imports from `@/platform` and never reaches `@tauri-apps/*` directly, so
// swapping in a web implementation is purely additive — write a parallel
// `src/platform/web/` directory and flip the selector in `getPlatform()`.

import type { AudioTranslation } from "@/domain/audio";
import type { PreferencesV1 } from "@/theme/types";

/** Read-only SQL access to the bundled corpus database. */
export interface CorpusAdapter {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  selectOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

/** Read/write SQL access to the user's annotations database. */
export interface UserDataAdapter {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

/** Result of resolving an audio source file's absolute path. */
export interface AudioSourcePath {
  path: string;
  exists: boolean;
}

/** Audio source-file resolution and download. The webview-playable URL is
 *  also a per-platform concern: Tauri uses `asset://`, the web build will
 *  use blob/HTTP. */
export interface AudioAdapter {
  sourcePath(
    translation: AudioTranslation,
    bookSlug: string,
    filename: string,
  ): Promise<AudioSourcePath>;
  bookSourcesPresent(
    translation: AudioTranslation,
    bookSlug: string,
  ): Promise<string[]>;
  downloadSource(
    translation: AudioTranslation,
    bookSlug: string,
    url: string,
    filename: string,
  ): Promise<string>;
  /** Turn an absolute path returned by `sourcePath` into a URL the webview
   *  can play. Synchronous because it's a pure string transform. */
  assetUrl(absolutePath: string): string;
}

/** Durable user-preferences blob. Today a single JSON file (theme overrides);
 *  the surface is intentionally minimal so the web build can back it with
 *  localStorage without re-implementing a filesystem. */
export interface PreferencesAdapter {
  read(): Promise<PreferencesV1 | null>;
  write(prefs: PreferencesV1): Promise<void>;
}

/** Static facts about the host environment. Evaluated once per process. */
export interface PlatformInfo {
  /** True when running inside a desktop shell (Tauri today). */
  isDesktop: boolean;
  isMacDesktop: boolean;
  isWindowsDesktop: boolean;
  isIOSDesktop: boolean;
}

export interface Platform {
  corpus: CorpusAdapter;
  userData: UserDataAdapter;
  audio: AudioAdapter;
  preferences: PreferencesAdapter;
  info: PlatformInfo;
}
