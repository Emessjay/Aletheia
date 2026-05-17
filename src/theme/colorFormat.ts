/**
 * Parsing/serialization for the two color formats the app stores in token
 * overrides: opaque hex (`#rrggbb`) and rgb-with-alpha (`rgb(R G B / A)`).
 *
 * Scrim tokens are the only ones with alpha today, but the editor needs to
 * accept either form regardless of which token is being edited — a user may
 * paste a hex into a scrim slot or vice versa.
 */

export type ParsedColor =
  | { kind: "hex"; value: string }
  | { kind: "rgba"; r: number; g: number; b: number; a: number };

/** Hex with optional alpha, or any rgb()/rgba() form CSS accepts. */
export function parseColor(input: string): ParsedColor | null {
  const s = input.trim();
  if (!s) return null;

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return { kind: "hex", value: `#${hex.toLowerCase()}` };
    }
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      const expanded = hex
        .split("")
        .map((c) => c + c)
        .join("");
      return { kind: "hex", value: `#${expanded.toLowerCase()}` };
    }
    if (/^[0-9a-f]{8}$/i.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (a >= 0.999) return { kind: "hex", value: rgbToHex(r, g, b) };
      return { kind: "rgba", r, g, b, a: round(a, 3) };
    }
    return null;
  }

  // Accept both modern `rgb(R G B / A)` and legacy `rgba(R, G, B, A)`.
  const m = s.match(
    /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!m) return null;
  const r = clampInt(parseInt(m[1], 10));
  const g = clampInt(parseInt(m[2], 10));
  const b = clampInt(parseInt(m[3], 10));
  let a = 1;
  if (m[4] != null) {
    a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    a = Math.max(0, Math.min(1, a));
  }
  if (a === 1) return { kind: "hex", value: rgbToHex(r, g, b) };
  return { kind: "rgba", r, g, b, a: round(a, 3) };
}

export function formatRgba(r: number, g: number, b: number, a: number): string {
  if (a >= 0.999) return rgbToHex(r, g, b);
  return `rgb(${r} ${g} ${b} / ${round(a, 3)})`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => clampInt(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Best-effort: extract the hex equivalent (alpha discarded) for `<input type="color">`. */
export function toHex(parsed: ParsedColor): string {
  if (parsed.kind === "hex") return parsed.value;
  return rgbToHex(parsed.r, parsed.g, parsed.b);
}

function clampInt(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
