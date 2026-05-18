// Tauri implementation of AudioAdapter.
//
// Source MP3s live at <app_data>/audio/<translation>/<book>/<filename>. The
// Rust side owns the path resolution and download logic; the adapter is a
// thin invoke() shim. `assetUrl` uses Tauri's `convertFileSrc` to mint the
// `asset://` URL the WKWebView can play — that requires
// `assetProtocol.enable = true` in tauri.conf.json with a scope covering the
// audio dir.

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
