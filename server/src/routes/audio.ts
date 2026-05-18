// /api/audio/*
//
// Serves the AudioAdapter shape for the web build. Files are cached under
// ALETHEIA_AUDIO_CACHE (default /tmp/aletheia-audio) — ephemeral on Railway
// but rebuilt on demand from upstream public-domain sources.
//
// Slug/filename validation mirrors src-tauri/src/audio.rs intentionally: the
// values land inside filesystem paths, so anything looser would be a path-
// traversal foot-gun. Keep these regexes in sync if the Rust side ever
// loosens its rules.

import { Router } from "express";
import type { Request, Response } from "express";
import { createReadStream, promises as fsp } from "fs";
import { Readable } from "stream";
import path from "path";

const ALLOWED_TRANSLATIONS = new Set(["en_bsb", "en_kjv", "en_web"]);

// Lowercase ascii + digits + underscore, 1..32 chars. Same as
// validate_slug() in audio.rs.
const SLUG_RE = /^[a-z0-9_]{1,32}$/;

// Filenames come from upstream URLs (LibriVox uses hyphens, parens, mixed
// case). Same as validate_filename() in audio.rs: alphanumeric + . _ - ( ),
// no path separators, no "..", must end with .mp3, 1..128 chars.
const FILENAME_RE = /^[A-Za-z0-9._\-()]{1,128}\.mp3$/;

interface ValidationOk {
  ok: true;
  translation: string;
  book: string;
  file: string;
}
interface ValidationErr {
  ok: false;
  status: number;
  error: string;
}
type Validation = ValidationOk | ValidationErr;

function validate(
  translation: unknown,
  book: unknown,
  file: unknown,
): Validation {
  if (typeof translation !== "string" || !ALLOWED_TRANSLATIONS.has(translation)) {
    return { ok: false, status: 400, error: `unsupported translation: ${translation}` };
  }
  if (typeof book !== "string" || !SLUG_RE.test(book)) {
    return { ok: false, status: 400, error: `invalid book slug: ${book}` };
  }
  if (file !== undefined) {
    if (typeof file !== "string" || file.includes("/") || file.includes("\\") || file.includes("..")) {
      return { ok: false, status: 400, error: `invalid filename: ${file}` };
    }
    if (!FILENAME_RE.test(file)) {
      return { ok: false, status: 400, error: `invalid filename: ${file}` };
    }
  }
  return { ok: true, translation, book, file: (file ?? "") as string };
}

function bookDir(cacheRoot: string, translation: string, book: string): string {
  return path.join(cacheRoot, translation, book);
}

function sourcePath(
  cacheRoot: string,
  translation: string,
  book: string,
  file: string,
): string {
  return path.join(bookDir(cacheRoot, translation, book), file);
}

function streamUrl(translation: string, book: string, file: string): string {
  return `/api/audio/stream/${translation}/${book}/${encodeURIComponent(file)}`;
}

async function fileExistsNonEmpty(p: string): Promise<boolean> {
  try {
    const st = await fsp.stat(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

export function audioRouter(cacheRoot: string): Router {
  const router = Router();

  router.get("/source-path", async (req, res) => {
    const v = validate(req.query.translation, req.query.book, req.query.file);
    if (!v.ok) {
      res.status(v.status).json({ error: v.error });
      return;
    }
    const p = sourcePath(cacheRoot, v.translation, v.book, v.file);
    const exists = await fileExistsNonEmpty(p);
    res.json({ url: streamUrl(v.translation, v.book, v.file), exists });
  });

  router.get("/book-sources", async (req, res) => {
    const v = validate(req.query.translation, req.query.book, undefined);
    if (!v.ok) {
      res.status(v.status).json({ error: v.error });
      return;
    }
    const dir = bookDir(cacheRoot, v.translation, v.book);
    let entries: string[] = [];
    try {
      const names = await fsp.readdir(dir);
      // Match the Rust side: only count .mp3 files that are present and
      // non-empty; skip half-written .part files and any zero-byte stragglers.
      const checked = await Promise.all(
        names
          .filter((n) => n.endsWith(".mp3"))
          .map(async (n) => ({ n, ok: await fileExistsNonEmpty(path.join(dir, n)) })),
      );
      entries = checked.filter((c) => c.ok).map((c) => c.n).sort();
    } catch (err: unknown) {
      if (!isENOENT(err)) {
        res.status(500).json({ error: `read_dir ${dir}: ${(err as Error).message}` });
        return;
      }
    }
    res.json(entries);
  });

  router.post("/download", async (req, res) => {
    const { translation, book, url, filename } = (req.body ?? {}) as {
      translation?: unknown;
      book?: unknown;
      url?: unknown;
      filename?: unknown;
    };
    const v = validate(translation, book, filename);
    if (!v.ok) {
      res.status(v.status).json({ error: v.error });
      return;
    }
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: `refusing non-http(s) URL: ${url}` });
      return;
    }
    const dest = sourcePath(cacheRoot, v.translation, v.book, v.file);
    const dir = path.dirname(dest);
    await fsp.mkdir(dir, { recursive: true });

    // Short-circuit if the file already exists. The Tauri code re-downloads
    // unconditionally; here we don't, because Railway's ephemeral disk means
    // the cache *is* the source of truth between deploys — a "download" call
    // after the file is already cached is almost certainly a frontend that
    // forgot to check source-path first.
    if (await fileExistsNonEmpty(dest)) {
      res.json({ url: streamUrl(v.translation, v.book, v.file) });
      return;
    }

    const part = `${dest}.part`;
    try {
      const upstream = await fetch(url, {
        headers: { "user-agent": "Aletheia/0.1 (https://github.com/Emessjay/aletheia)" },
      });
      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ error: `GET ${url} returned HTTP ${upstream.status}` });
        return;
      }
      const out = (await import("fs")).createWriteStream(part);
      // The Web ReadableStream returned by undici needs adapting to Node's
      // stream API; Readable.fromWeb is the supported bridge.
      const nodeStream = Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
      await new Promise<void>((resolve, reject) => {
        nodeStream.pipe(out);
        nodeStream.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => resolve());
      });
      await fsp.rename(part, dest);
      res.json({ url: streamUrl(v.translation, v.book, v.file) });
    } catch (err: unknown) {
      // Best-effort cleanup; ignore failure (the partial may already be gone).
      await fsp.unlink(part).catch(() => undefined);
      res.status(502).json({ error: `download failed: ${(err as Error).message}` });
    }
  });

  router.get("/stream/:translation/:book/:file", async (req, res) => {
    const v = validate(req.params.translation, req.params.book, req.params.file);
    if (!v.ok) {
      res.status(v.status).json({ error: v.error });
      return;
    }
    const p = sourcePath(cacheRoot, v.translation, v.book, v.file);
    let stat;
    try {
      stat = await fsp.stat(p);
    } catch {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (!stat.isFile() || stat.size === 0) {
      res.status(404).json({ error: "not found" });
      return;
    }
    streamRange(req, res, p, stat.size);
  });

  return router;
}

function isENOENT(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

// HTTP Range support. The browser <audio> tag fires a Range request whenever
// the user seeks, so without this every seek triggers a full re-download.
function streamRange(req: Request, res: Response, filePath: string, size: number): void {
  const range = req.headers.range;
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("content-type", "audio/mpeg");

  if (!range) {
    res.setHeader("content-length", String(size));
    createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    res.status(416).setHeader("content-range", `bytes */${size}`);
    res.end();
    return;
  }
  const startRaw = match[1];
  const endRaw = match[2];

  let start: number;
  let end: number;
  if (startRaw === "" && endRaw !== "") {
    // suffix-byte-range: last N bytes
    const suffix = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      res.status(416).setHeader("content-range", `bytes */${size}`).end();
      return;
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = startRaw === "" ? 0 : Number.parseInt(startRaw, 10);
    end = endRaw === "" ? size - 1 : Number.parseInt(endRaw, 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0 || end >= size) {
    res.status(416).setHeader("content-range", `bytes */${size}`);
    res.end();
    return;
  }

  res.status(206);
  res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
  res.setHeader("content-length", String(end - start + 1));
  createReadStream(filePath, { start, end }).pipe(res);
}
