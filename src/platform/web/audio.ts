// Web implementation of AudioAdapter.
//
// All four methods are HTTP calls to the Wave 3a Node server under
// `/api/audio/*`. The interface still talks about "absolute paths" because
// that is what makes sense in the Tauri world — on disk, `convertFileSrc`
// turns the path into an `asset://...` URL the WKWebView can play. In the
// browser there is no filesystem, so the server hands us a relative URL
// (`/api/audio/stream/<translation>/<book>/<file>`) and we use that as the
// "path" *and* the playable URL.
//
// Contract:
//   - `sourcePath().path` is the playable URL itself.
//   - `assetUrl(path)` is therefore the identity function — the path is
//     already a URL the <audio> tag can fetch.
//   - `downloadSource()` returns the same URL once the server has fetched
//     the upstream MP3 into its cache.
// A future contributor swapping in CDN-signed URLs only needs to change
// the server response; this adapter stays unchanged.

import type { AudioTranslation } from "@/domain/audio";
import type { AudioAdapter, AudioSourcePath } from "../types";

interface SourcePathResponse {
  url: string;
  exists: boolean;
}
interface DownloadResponse {
  url: string;
}
interface ErrorResponse {
  error?: string;
}

async function unwrap<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as ErrorResponse;
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // not JSON
    }
    throw new Error(`${label}: ${message}`);
  }
  return (await res.json()) as T;
}

export const webAudio: AudioAdapter = {
  async sourcePath(
    translation: AudioTranslation,
    bookSlug: string,
    filename: string,
  ): Promise<AudioSourcePath> {
    const qs = new URLSearchParams({
      translation,
      book: bookSlug,
      file: filename,
    });
    const res = await fetch(`/api/audio/source-path?${qs.toString()}`);
    const body = await unwrap<SourcePathResponse>(res, "audio source-path");
    return { path: body.url, exists: body.exists };
  },

  async bookSourcesPresent(
    translation: AudioTranslation,
    bookSlug: string,
  ): Promise<string[]> {
    const qs = new URLSearchParams({ translation, book: bookSlug });
    const res = await fetch(`/api/audio/book-sources?${qs.toString()}`);
    return unwrap<string[]>(res, "audio book-sources");
  },

  async downloadSource(
    translation: AudioTranslation,
    bookSlug: string,
    url: string,
    filename: string,
  ): Promise<string> {
    const res = await fetch("/api/audio/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ translation, book: bookSlug, url, filename }),
    });
    const body = await unwrap<DownloadResponse>(res, "audio download");
    return body.url;
  },

  assetUrl(absolutePath: string): string {
    return absolutePath;
  },
};
