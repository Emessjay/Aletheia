import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOR_TOKEN_KEYS } from "./tokens";

const CSS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "styles",
  "index.css",
);

const css = readFileSync(CSS_PATH, "utf8");

function blockBody(selector: string): string {
  // Match the first `selector { ... }` block at top-level. The stylesheet is
  // hand-authored and doesn't nest custom-property declarations, so a non-greedy
  // capture between the selector and the matching closing brace is sufficient.
  const re = new RegExp(`${escapeRe(selector)}\\s*\\{([^}]*)\\}`);
  const match = css.match(re);
  if (!match) throw new Error(`could not find ${selector} block in index.css`);
  return match[1];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declaredKeys(body: string): Set<string> {
  const out = new Set<string>();
  // Custom-property declarations look like `  --color-bg: #fff;` — pick the
  // identifier between `--` and the colon.
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:/gi)) {
    out.add(m[1]);
  }
  return out;
}

describe("color token registry", () => {
  const rootKeys = new Set([
    ...declaredKeys(blockBody(":root")),
    // The Tailwind 4 @theme block also contributes tokens (it lives outside :root
    // but feeds the same custom-property cascade).
    ...declaredKeys(blockBody("@theme")),
  ]);
  const darkKeys = declaredKeys(blockBody(".dark"));

  it("every registry key is declared in :root or @theme", () => {
    const missing = COLOR_TOKEN_KEYS.filter((k) => !rootKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("every registry key has a .dark override", () => {
    const missing = COLOR_TOKEN_KEYS.filter((k) => !darkKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("has no duplicate keys", () => {
    const seen = new Set<string>();
    for (const k of COLOR_TOKEN_KEYS) {
      expect(seen.has(k), `duplicate key: ${k}`).toBe(false);
      seen.add(k);
    }
  });
});
