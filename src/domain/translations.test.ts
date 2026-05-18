import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRANSLATIONS,
  audioTranslations,
  commentaryReferenceTranslation,
  getTranslation,
  readerTabTranslations,
  translationsInOrder,
} from "./translations";

describe("translations registry", () => {
  it("has exactly one commentary-reference entry", () => {
    const matches = TRANSLATIONS.filter((t) => t.isCommentaryReference);
    expect(matches).toHaveLength(1);
    expect(commentaryReferenceTranslation().id).toBe(matches[0].id);
  });

  it("getTranslation round-trips every registered id", () => {
    for (const t of TRANSLATIONS) {
      expect(getTranslation(t.id)).toEqual(t);
    }
  });

  it("translationsInOrder is sorted by defaultOrder", () => {
    const ordered = translationsInOrder();
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].defaultOrder).toBeGreaterThan(
        ordered[i - 1].defaultOrder,
      );
    }
  });

  it("readerTabTranslations matches the isReaderTab subset", () => {
    expect(readerTabTranslations().map((t) => t.id)).toEqual(
      translationsInOrder()
        .filter((t) => t.isReaderTab)
        .map((t) => t.id),
    );
  });
});

// Parity tests: the audio allow-list lives in three places — TypeScript
// (the `hasAudio` flag here), Rust (`matches!()` in src-tauri/src/audio.rs),
// and Node (`ALLOWED_TRANSLATIONS` in server/src/routes/audio.ts). All three
// must agree or the web build serves URLs the desktop side rejects (or vice
// versa). Codegen would be cleaner but a static read+regex parse is far
// simpler for a list that changes once a year, so we just verify the
// invariant.
describe("audio.rs ↔ translations registry parity", () => {
  it("Rust validate_translation matches audioTranslations()", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const audioRsPath = resolve(here, "../../src-tauri/src/audio.rs");
    const source = readFileSync(audioRsPath, "utf8");

    // Find: `if !matches!(t, "en_bsb" | "en_kjv" | "en_web") {`
    const m = source.match(
      /matches!\(\s*t\s*,\s*((?:"[a-z0-9_]+"\s*\|?\s*)+)\)/,
    );
    expect(
      m,
      "expected `matches!(t, \"...\" | \"...\")` in src-tauri/src/audio.rs",
    ).not.toBeNull();

    const ids = (m![1].match(/"[a-z0-9_]+"/g) ?? []).map((s) => s.slice(1, -1));
    const tsIds = audioTranslations()
      .map((t) => t.id)
      .sort();
    expect([...ids].sort()).toEqual(tsIds);
  });
});

describe("server audio.ts ↔ translations registry parity", () => {
  it("Node ALLOWED_TRANSLATIONS matches audioTranslations()", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const audioTsPath = resolve(here, "../../server/src/routes/audio.ts");
    const source = readFileSync(audioTsPath, "utf8");

    // Find: `const ALLOWED_TRANSLATIONS = new Set(["en_bsb", "en_kjv", "en_web"]);`
    const m = source.match(
      /ALLOWED_TRANSLATIONS\s*=\s*new Set\(\s*\[\s*((?:"[a-z0-9_]+"\s*,?\s*)+)\]/,
    );
    expect(
      m,
      "expected `ALLOWED_TRANSLATIONS = new Set([...])` in server/src/routes/audio.ts",
    ).not.toBeNull();

    const ids = (m![1].match(/"[a-z0-9_]+"/g) ?? []).map((s) => s.slice(1, -1));
    const tsIds = audioTranslations()
      .map((t) => t.id)
      .sort();
    expect([...ids].sort()).toEqual(tsIds);
  });
});
