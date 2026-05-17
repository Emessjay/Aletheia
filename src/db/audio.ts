// Frontend wrapper for the Rust audio commands.
// Source MP3s live at <app_data>/audio/<translation>/<book>/<filename>. Each
// chapter resolves to a (filename, startSec, endSec) triple via the audio
// manifest; multiple "virtual" chapters may share one source file.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AudioTranslation } from "@/domain/audio";

export interface SourcePath {
  path: string;
  exists: boolean;
}

export async function audioSourcePath(
  translation: AudioTranslation,
  bookSlug: string,
  filename: string,
): Promise<SourcePath> {
  return invoke<SourcePath>("audio_source_path", {
    translation,
    bookSlug,
    filename,
  });
}

export async function audioBookSourcesPresent(
  translation: AudioTranslation,
  bookSlug: string,
): Promise<string[]> {
  return invoke<string[]>("audio_book_sources_present", {
    translation,
    bookSlug,
  });
}

export async function audioDownloadSource(
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
}

/** Turn an absolute filesystem path into the asset:// URL the webview can
 *  play. Requires `assetProtocol.enable = true` in tauri.conf.json with a
 *  scope that covers the audio dir. */
export function audioAssetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

// ── React Query hooks ───────────────────────────────────────────────────────

const audioKey = {
  sourcesPresent: (translation: AudioTranslation, bookSlug: string) =>
    ["audio", "sourcesPresent", translation, bookSlug] as const,
  sourcePath: (
    translation: AudioTranslation,
    bookSlug: string,
    filename: string,
  ) => ["audio", "sourcePath", translation, bookSlug, filename] as const,
};

export function useAudioBookSourcesPresent(
  translation: AudioTranslation | null,
  bookSlug: string | null,
) {
  return useQuery({
    queryKey: audioKey.sourcesPresent(translation ?? "en_bsb", bookSlug ?? ""),
    queryFn: () => audioBookSourcesPresent(translation!, bookSlug!),
    enabled: !!translation && !!bookSlug,
    staleTime: 30_000,
  });
}

export function useAudioSourcePath(
  translation: AudioTranslation | null,
  bookSlug: string | null,
  filename: string | null,
) {
  return useQuery({
    queryKey: audioKey.sourcePath(
      translation ?? "en_bsb",
      bookSlug ?? "",
      filename ?? "",
    ),
    queryFn: () => audioSourcePath(translation!, bookSlug!, filename!),
    enabled: !!translation && !!bookSlug && !!filename,
  });
}

export function useDownloadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      translation: AudioTranslation;
      bookSlug: string;
      url: string;
      filename: string;
    }) =>
      audioDownloadSource(
        args.translation,
        args.bookSlug,
        args.url,
        args.filename,
      ),
    onSuccess: (_path, { translation, bookSlug, filename }) => {
      qc.invalidateQueries({
        queryKey: audioKey.sourcesPresent(translation, bookSlug),
      });
      qc.invalidateQueries({
        queryKey: audioKey.sourcePath(translation, bookSlug, filename),
      });
    },
  });
}
