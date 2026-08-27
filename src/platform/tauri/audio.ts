// Tauri implementation of AudioAdapter.
//
// Rust resolves each source MP3 pack-first (`data/packs/audio-modern-en/` or
// user-installed copy under `<app_data>/packs/`), hard-links it into
// `<app_data>/audio/<translation>/<book>/<filename>`, then falls back to
// on-demand download when the pack file is missing. The adapter is a thin
// invoke() shim. `assetUrl` uses `convertFileSrc` for the cache path —
// `assetProtocol.enable` in tauri.conf.json must cover `$APPDATA/audio/**`.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { AudioTranslation } from "@/domain/audio";
import type { AudioAdapter, AudioSourcePath } from "../types";

export const tauriAudio: AudioAdapter = {
  sourcePath(
    translation: AudioTranslation,
    bookSlug: string,
    filename: string,
  ): Promise<AudioSourcePath> {
    return invoke<AudioSourcePath>("audio_source_path", {
      translation,
      bookSlug,
      filename,
    });
  },
  bookSourcesPresent(
    translation: AudioTranslation,
    bookSlug: string,
  ): Promise<string[]> {
    return invoke<string[]>("audio_book_sources_present", {
      translation,
      bookSlug,
    });
  },
  downloadSource(
    translation: AudioTranslation,
    bookSlug: string,
    url: string,
    filename: string,
  ): Promise<string> {
    return invoke<string>("audio_download_source", {
      translation,
      bookSlug,
      url,
      filename,
    });
  },
  assetUrl(absolutePath: string): string {
    return convertFileSrc(absolutePath);
  },
};
