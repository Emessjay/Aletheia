// HTTP-level tests for /api/health, /api/corpus/*, /api/audio/*. The tests
// build a small express app inline (no /static, no SPA fallback) so they
// exercise the routers as units — the static-handler glue is covered by the
// fact that npm run build keeps producing a working server bundle.

import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { corpusRouter } from "../routes/corpus";
import { audioRouter } from "../routes/audio";
import { openCorpus } from "../corpus";
import { buildFixtureCorpus } from "./fixture";

interface Harness {
  app: express.Express;
  cacheRoot: string;
  cleanup: () => void;
}

function makeApp(): Harness {
  const { db } = buildFixtureCorpus();
  const dir = mkdtempSync(path.join(tmpdir(), "aletheia-routes-test-"));
  const file = path.join(dir, "fixture.sqlite");
  writeFileSync(file, db.serialize());
  db.close();
  const corpus = openCorpus(file);
  const cacheRoot = path.join(dir, "audio");

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, corpus: "loaded" });
  });
  app.use("/api/corpus", corpusRouter(corpus));
  app.use("/api/audio", audioRouter(cacheRoot));

  return {
    app,
    cacheRoot,
    cleanup: () => {
      corpus.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("/api/health", () => {
  it("returns ok + corpus loaded", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, corpus: "loaded" });
    } finally {
      h.cleanup();
    }
  });
});

describe("/api/corpus/select", () => {
  it("returns rows for a $N-bound SELECT", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/select")
        .send({
          sql: `SELECT slug, name FROM book WHERE language = $1 ORDER BY order_index`,
          params: ["en_bsb"],
        });
      expect(res.status).toBe(200);
      expect(res.body.rows.map((r: { slug: string }) => r.slug)).toEqual([
        "gen",
        "john",
      ]);
    } finally {
      h.cleanup();
    }
  });

  it("rejects non-string sql with 400", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/select")
        .send({ sql: 12345, params: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sql must be a string/);
    } finally {
      h.cleanup();
    }
  });

  it("rejects non-array params with 400", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/select")
        .send({ sql: "SELECT 1", params: "oops" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/params must be an array/);
    } finally {
      h.cleanup();
    }
  });

  it("rejects multi-statement SQL with 400", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/select")
        .send({ sql: "SELECT 1; DROP TABLE book", params: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/multi-statement/);
    } finally {
      h.cleanup();
    }
  });

  it("runs the FTS query the frontend builds for 'beginning'", async () => {
    // The exact SQL `searchVerses` issues — copied from src/db/queries.ts —
    // must return a hit for our fixture verse, with snippet marks the UI
    // parses out.
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/select")
        .send({
          sql: `SELECT v.id AS verse_id,
                       b.slug AS book_slug,
                       b.name AS book_name,
                       b.language AS translation,
                       c.number AS chapter,
                       v.number AS verse,
                       snippet(verse_fts, 0, $2, $3, '…', 12) AS snippet
                  FROM verse_fts
                  JOIN verse v   ON v.id = verse_fts.rowid
                  JOIN chapter c ON c.id = v.chapter_id
                  JOIN book b    ON b.id = c.book_id
                 WHERE verse_fts MATCH $1
                 ORDER BY rank
                 LIMIT $4 OFFSET $5`,
          params: ['"beginning"*', "", "", 10, 0],
        });
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeGreaterThan(0);
      const hit = res.body.rows[0];
      expect(hit.book_slug).toBe("gen");
      expect(hit.chapter).toBe(1);
      expect(hit.verse).toBe(1);
      expect(hit.snippet).toContain("beginning");
    } finally {
      h.cleanup();
    }
  });
});

describe("/api/corpus/selectOne", () => {
  it("returns a row for findBook's slug-or-name SQL", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/selectOne")
        .send({
          sql: `SELECT * FROM book WHERE language = $1 AND (slug = $2 OR lower(name) = lower($2))`,
          params: ["en_bsb", "Genesis"],
        });
      expect(res.status).toBe(200);
      expect(res.body.row).not.toBeNull();
      expect(res.body.row.slug).toBe("gen");
    } finally {
      h.cleanup();
    }
  });

  it("returns row: null when nothing matches", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/corpus/selectOne")
        .send({
          sql: `SELECT * FROM book WHERE slug = $1`,
          params: ["nope"],
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ row: null });
    } finally {
      h.cleanup();
    }
  });
});

describe("/api/audio validation", () => {
  it("rejects an unknown translation on source-path", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .get("/api/audio/source-path")
        .query({ translation: "en_unknown", book: "gen", file: "a.mp3" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsupported translation/);
    } finally {
      h.cleanup();
    }
  });

  it("rejects a slug with uppercase letters", async () => {
    // Mirrors src-tauri/src/audio.rs's validate_slug — the regex disallows
    // anything outside [a-z0-9_]. Keep this aligned across all three audio
    // implementations.
    const h = makeApp();
    try {
      const res = await request(h.app)
        .get("/api/audio/source-path")
        .query({ translation: "en_bsb", book: "Gen", file: "a.mp3" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid book slug/);
    } finally {
      h.cleanup();
    }
  });

  it("rejects a filename containing path traversal", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .get("/api/audio/source-path")
        .query({
          translation: "en_bsb",
          book: "gen",
          file: "../../etc/passwd",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid filename/);
    } finally {
      h.cleanup();
    }
  });

  it("rejects a non-.mp3 filename", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .get("/api/audio/source-path")
        .query({ translation: "en_bsb", book: "gen", file: "track.wav" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid filename/);
    } finally {
      h.cleanup();
    }
  });

  it("reports exists:false for a missing file", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .get("/api/audio/source-path")
        .query({ translation: "en_bsb", book: "gen", file: "missing.mp3" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        url: "/api/audio/stream/en_bsb/gen/missing.mp3",
        exists: false,
      });
    } finally {
      h.cleanup();
    }
  });

  it("lists only present, non-empty .mp3 files in book-sources", async () => {
    const h = makeApp();
    try {
      const present = path.join(h.cacheRoot, "en_bsb", "gen");
      await fsp.mkdir(present, { recursive: true });
      await fsp.writeFile(path.join(present, "01_in_the_beginning.mp3"), "hi");
      await fsp.writeFile(
        path.join(present, "02_half_written.mp3.part"),
        "fragment",
      );
      await fsp.writeFile(path.join(present, "03_empty.mp3"), "");

      const res = await request(h.app)
        .get("/api/audio/book-sources")
        .query({ translation: "en_bsb", book: "gen" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(["01_in_the_beginning.mp3"]);
    } finally {
      h.cleanup();
    }
  });

  it("returns 400 on /api/audio/download for a non-http(s) URL", async () => {
    const h = makeApp();
    try {
      const res = await request(h.app)
        .post("/api/audio/download")
        .send({
          translation: "en_bsb",
          book: "gen",
          url: "file:///etc/passwd",
          filename: "evil.mp3",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/refusing non-http/);
    } finally {
      h.cleanup();
    }
  });

  it("streams a cached .mp3 with HTTP 200 and audio/mpeg", async () => {
    const h = makeApp();
    try {
      const present = path.join(h.cacheRoot, "en_bsb", "gen");
      await fsp.mkdir(present, { recursive: true });
      const body = Buffer.from("ID3\x03\x00\x00\x00fake-mp3-bytes-here");
      await fsp.writeFile(path.join(present, "track.mp3"), body);
      const res = await request(h.app)
        .get("/api/audio/stream/en_bsb/gen/track.mp3");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("audio/mpeg");
      expect(res.headers["accept-ranges"]).toBe("bytes");
      expect(res.headers["content-length"]).toBe(String(body.length));
    } finally {
      h.cleanup();
    }
  });

  it("honors HTTP Range and returns 206 with content-range", async () => {
    const h = makeApp();
    try {
      const present = path.join(h.cacheRoot, "en_bsb", "gen");
      await fsp.mkdir(present, { recursive: true });
      const body = Buffer.alloc(1024, 0xab);
      await fsp.writeFile(path.join(present, "ranged.mp3"), body);
      const res = await request(h.app)
        .get("/api/audio/stream/en_bsb/gen/ranged.mp3")
        .set("Range", "bytes=100-199");
      expect(res.status).toBe(206);
      expect(res.headers["content-range"]).toBe(`bytes 100-199/1024`);
      expect(res.headers["content-length"]).toBe("100");
    } finally {
      h.cleanup();
    }
  });
});
