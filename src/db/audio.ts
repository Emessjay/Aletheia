// Frontend wrapper for the audio source-file API. The raw filesystem and
// download operations are delegated to the platform's AudioAdapter; the
// React Query hooks below are platform-agnostic and stay here.
//
// Source MP3s live at <app_data>/audio/<translation>/<book>/<filename>. Each
// chapter resolves to a (filename, startSec, endSec) triple via the audio
// manifest; multiple "virtual" chapters may share one source file.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPlatform } from "@/platform";
import type { AudioSourcePath } from "@/platform";
import type { AudioTranslation } from "@/domain/audio";

export type SourcePath = AudioSourcePath;

export function audioSourcePath(
  translation: AudioTranslation,
  bookSlug: string,
  filename: string,
): Promise<SourcePath> {
  return getPlatform().audio.sourcePath(translation, bookSlug, filename);
}

export function audioBookSourcesPresent(
  translation: AudioTranslation,
  bookSlug: string,
): Promise<string[]> {
  return getPlatform().audio.bookSourcesPresent(translation, bookSlug);
}

export function audioDownloadSource(
  translation: AudioTranslation,
  bookSlug: string,
  url: string,
  filename: string,
): Promise<string> {
  return getPlatform().audio.downloadSource(translation, bookSlug, url, filename);
}

/** Turn an absolute filesystem path into a URL the webview can play. The
 *  exact scheme is platform-specific (Tauri: `asset://`; web will be HTTP
 *  or blob:) — callers should treat the return value as opaque. */
export function audioAssetUrl(absolutePath: string): string {
  return getPlatform().audio.assetUrl(absolutePath);
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
