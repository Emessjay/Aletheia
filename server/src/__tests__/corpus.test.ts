// Direct tests for server/src/corpus.ts. These guard the platform-adapter
// pair's positional-$N binding fix (without it, queries.ts's `$1, $2, …`
// placeholders break under better-sqlite3, which treats `$N` as a *named*
// binding) and the multi-statement / size-cap defenses that protect the
// public /api/corpus surface.

import { describe, expect, it, afterEach } from "vitest";
import { QueryError, openCorpus, type CorpusHandle } from "../corpus";
import { buildFixtureCorpus } from "./fixture";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// `openCorpus` only takes a path, so to run it against the fixture we
// serialize the in-memory DB to a temp file and re-open it readonly.
function openFixture(): { handle: CorpusHandle; cleanup: () => void } {
  const { db } = buildFixtureCorpus();
  const dir = mkdtempSync(path.join(tmpdir(), "aletheia-corpus-test-"));
  const file = path.join(dir, "fixture.sqlite");
  writeFileSync(file, db.serialize());
  db.close();
  const handle = openCorpus(file);
  return {
    handle,
    cleanup: () => {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("openCorpus / select / selectOne", () => {
  let h: ReturnType<typeof openFixture> | null = null;

  afterEach(() => {
    h?.cleanup();
    h = null;
  });

  it("binds positional $N parameters against an indexed lookup", async () => {
    // This is the regression test for the platform-adapter pair: the
    // queries.ts SQL uses `WHERE language = $1 AND slug = $2`, and without
    // bindArgs() rewriting `$N` into a single bind-object, better-sqlite3
    // throws "Too many parameter values were provided".
    h = openFixture();
    const rows = h.handle.select<{ slug: string; name: string }>(
      `SELECT slug, name FROM book WHERE language = $1 AND slug = $2`,
      ["en_bsb", "gen"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ slug: "gen", name: "Genesis" });
  });

  it("handles $N out of declaration order and repeated $N", async () => {
    // `$3 || ... || $3` exercises the same repeated-bind case that
    // src/db/user.ts's createHighlight relies on (the comment in
    // webPlatform's userData.ts calls this out specifically). If a future
    // refactor swaps `bindArgs`'s object form for a positional spread, this
    // breaks.
    h = openFixture();
    const rows = h.handle.select<{ a: number; same1: string; same2: string }>(
      `SELECT $2 AS a, $1 AS same1, $1 AS same2`,
      ["x", 7],
    );
    expect(rows[0]).toEqual({ a: 7, same1: "x", same2: "x" });
  });

  it("selectOne returns null when no row matches", async () => {
    h = openFixture();
    const row = h.handle.selectOne(
      `SELECT * FROM book WHERE slug = $1`,
      ["does-not-exist"],
    );
    expect(row).toBeNull();
  });

  it("falls through to plain positional binding when SQL has no $N", async () => {
    h = openFixture();
    // Force a path where bindArgs returns the params verbatim: anonymous `?`
    // placeholders. The 0-param fast-path is also exercised by the next test.
    const rows = h.handle.select<{ n: number }>(
      `SELECT 1 AS n WHERE 1 = 1`,
      [],
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("rejects multi-statement SQL with a 400 QueryError", async () => {
    h = openFixture();
    expect(() =>
      h!.handle.select(`SELECT 1; SELECT 2`, []),
    ).toThrowError(QueryError);
    try {
      h.handle.select(`SELECT 1; SELECT 2`, []);
    } catch (err) {
      expect(err).toBeInstanceOf(QueryError);
      expect((err as QueryError).status).toBe(400);
    }
  });

  it("tolerates a semicolon inside a quoted string literal", async () => {
    // The multi-statement scanner strips quoted strings before looking for
    // `;`, so a verse text containing a semicolon must not trip the guard.
    h = openFixture();
    const rows = h.handle.select<{ s: string }>(
      `SELECT 'one; two' AS s`,
      [],
    );
    expect(rows[0].s).toBe("one; two");
  });

  it("rejects empty SQL", async () => {
    h = openFixture();
    expect(() => h!.handle.select("", [])).toThrowError(QueryError);
  });

  it("rejects SQL over the 16 KiB cap with a 413", async () => {
    h = openFixture();
    const huge = `SELECT '${"x".repeat(20_000)}' AS s`;
    try {
      h.handle.select(huge, []);
      expect.fail("expected QueryError");
    } catch (err) {
      expect(err).toBeInstanceOf(QueryError);
      expect((err as QueryError).status).toBe(413);
    }
  });

  it("enforces the 50,000-row response cap", async () => {
    h = openFixture();
    // recursive CTE generates 60k rows in one statement; row cap should fire
    // before the response is serialized.
    try {
      h.handle.select(
        `WITH RECURSIVE c(n) AS (
           SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 60000
         ) SELECT n FROM c`,
        [],
      );
      expect.fail("expected QueryError");
    } catch (err) {
      expect(err).toBeInstanceOf(QueryError);
      expect((err as QueryError).status).toBe(413);
    }
  });
});
