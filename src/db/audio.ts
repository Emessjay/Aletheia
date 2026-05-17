// Frontend wrapper for the Rust audio commands.
// Files live at <app_data>/audio/<translation>/<book>/<NNN>.mp3; Rust treats
// the filesystem as the source of truth and these helpers just relay.

import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AudioTranslation } from "@/domain/audio";

export interface ChapterPath {
  path: string;
  exists: boolean;
}

export async function audioChapterPath(
  translation: AudioTranslation,
  bookSlug: string,
  chapter: number,
): Promise<ChapterPath> {
  return invoke<ChapterPath>("audio_chapter_path", {
    translation,
    bookSlug,
    chapter,
  });
}

export async function audioBookDownloaded(
  translation: AudioTranslation,
  bookSlug: string,
): Promise<number[]> {
  return invoke<number[]>("audio_book_downloaded", { translation, bookSlug });
}

export async function audioDownloadChapter(
  translation: AudioTranslation,
  bookSlug: string,
  chapter: number,
  url: string,
): Promise<string> {
  return invoke<string>("audio_download_chapter", {
    translation,
    bookSlug,
    chapter,
    url,
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
  downloaded: (translation: AudioTranslation, bookSlug: string) =>
    ["audio", "downloaded", translation, bookSlug] as const,
  chapter: (
    translation: AudioTranslation,
    bookSlug: string,
    chapter: number,
  ) => ["audio", "chapter", translation, bookSlug, chapter] as const,
};

export function useAudioBookDownloaded(
  translation: AudioTranslation | null,
  bookSlug: string | null,
) {
  return useQuery({
    queryKey: audioKey.downloaded(translation ?? "en_bsb", bookSlug ?? ""),
    queryFn: () => audioBookDownloaded(translation!, bookSlug!),
    enabled: !!translation && !!bookSlug,
    staleTime: 30_000,
  });
}

export function useAudioChapterPath(
  translation: AudioTranslation | null,
  bookSlug: string | null,
  chapter: number | null,
) {
  return useQuery({
    queryKey: audioKey.chapter(
      translation ?? "en_bsb",
      bookSlug ?? "",
      chapter ?? 0,
    ),
    queryFn: () => audioChapterPath(translation!, bookSlug!, chapter!),
    enabled: !!translation && !!bookSlug && !!chapter,
  });
}

export function useDownloadChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      translation: AudioTranslation;
      bookSlug: string;
      chapter: number;
      url: string;
    }) =>
      audioDownloadChapter(
        args.translation,
        args.bookSlug,
        args.chapter,
        args.url,
      ),
    onSuccess: (_path, { translation, bookSlug, chapter }) => {
      qc.invalidateQueries({
        queryKey: audioKey.downloaded(translation, bookSlug),
      });
      qc.invalidateQueries({
        queryKey: audioKey.chapter(translation, bookSlug, chapter),
      });
    },
  });
}
