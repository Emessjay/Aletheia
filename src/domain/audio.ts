// Audio narration manifest.
//
// For each (translation, book_slug, chapter) we resolve a `ChapterAudio`:
// a source-MP3 URL plus the start/end seconds of that chapter within the
// file. Most chapters map 1:1 to a per-chapter MP3 (startSec=0, endSec=null);
// the multi-chapter LibriVox KJV recordings instead share one source MP3
// across several chapters, with boundaries computed offline by aeneas (see
// tools/audio/align_kjv.py) and shipped in kjv-timing.json.
//
// Coverage matrix (all recordings public domain):
//   BSB (en_bsb): OT + NT, Bob Souer (openbible.com), one MP3 per chapter.
//                 BSB has no deuterocanon, so en_bsb falls back transparently
//                 to WEB recordings (Michael Paul Johnson, ebible.org) for
//                 those books — same pattern as the text-side fallback in
//                 db/queries.ts.
//   WEB (en_web): Deuterocanon only, Michael Paul Johnson (ebible.org).
//                 Not user-selectable on its own; reached via the en_bsb
//                 fallback above.
//   KJV (en_kjv): partial OT, full NT (NT via aeneas-aligned virtual chapters),
//                 partial Apocrypha (LibriVox)

import type { CorpusLanguage } from "@/db/types";
import kjvTimingJson from "../../data/audio/kjv-timing.json";

export type AudioTranslation = "en_bsb" | "en_kjv" | "en_web";

export interface AudioSourceInfo {
  translation: AudioTranslation;
  label: string;
  narrator: string;
  license: string;
  sourceUrl: string;
}

export const AUDIO_SOURCES: Record<AudioTranslation, AudioSourceInfo> = {
  en_bsb: {
    translation: "en_bsb",
    label: "Berean Standard Bible",
    narrator: "Bob Souer",
    license: "Public Domain (CC0 1.0)",
    sourceUrl: "https://openbible.com/audio.htm",
  },
  en_web: {
    translation: "en_web",
    label: "World English Bible — Deuterocanon",
    narrator: "Michael Paul Johnson",
    license: "Public Domain",
    sourceUrl: "https://ebible.org/webaudio/",
  },
  en_kjv: {
    translation: "en_kjv",
    label: "King James Version",
    narrator: "LibriVox volunteers",
    license: "Public Domain",
    sourceUrl: "https://archive.org/details/librivoxaudio",
  },
};

export interface ChapterAudio {
  /** The MP3 URL to download. May span multiple chapters. */
  sourceUrl: string;
  /** Basename derived from `sourceUrl` — used as the on-disk filename. */
  sourceFilename: string;
  /** Where this chapter starts within the source MP3, in seconds. */
  startSec: number;
  /** Where this chapter ends. `null` means "end of file" — the player should
   *  not enforce an end boundary. */
  endSec: number | null;
}

export function isAudioTranslation(lang: CorpusLanguage): lang is AudioTranslation {
  return lang === "en_bsb" || lang === "en_kjv" || lang === "en_web";
}

function basename(url: string): string {
  const path = url.split("?")[0]!.split("#")[0]!;
  const last = path.split("/").pop() ?? "";
  // The filename feeds a Rust validator that rejects path-traversal sequences,
  // so URL-decode it now and reject anything pathological here too.
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function fullChapter(url: string): ChapterAudio {
  return {
    sourceUrl: url,
    sourceFilename: basename(url),
    startSec: 0,
    endSec: null,
  };
}

// ── BSB (openbible.com / Bob Souer) ─────────────────────────────────────────

interface BsbBook {
  num: number;
  code: string;
  chapters: number;
}

const BSB_BOOKS: Record<string, BsbBook> = {
  gen: { num: 1, code: "Gen", chapters: 50 },
  exod: { num: 2, code: "Exo", chapters: 40 },
  lev: { num: 3, code: "Lev", chapters: 27 },
  num: { num: 4, code: "Num", chapters: 36 },
  deut: { num: 5, code: "Deu", chapters: 34 },
  josh: { num: 6, code: "Jos", chapters: 24 },
  judg: { num: 7, code: "Jdg", chapters: 21 },
  ruth: { num: 8, code: "Rut", chapters: 4 },
  "1sam": { num: 9, code: "1Sa", chapters: 31 },
  "2sam": { num: 10, code: "2Sa", chapters: 24 },
  "1kgs": { num: 11, code: "1Ki", chapters: 22 },
  "2kgs": { num: 12, code: "2Ki", chapters: 25 },
  "1chr": { num: 13, code: "1Ch", chapters: 29 },
  "2chr": { num: 14, code: "2Ch", chapters: 36 },
  ezra: { num: 15, code: "Ezr", chapters: 10 },
  neh: { num: 16, code: "Neh", chapters: 13 },
  esth: { num: 17, code: "Est", chapters: 10 },
  job: { num: 18, code: "Job", chapters: 42 },
  ps: { num: 19, code: "Psa", chapters: 150 },
  prov: { num: 20, code: "Pro", chapters: 31 },
  eccl: { num: 21, code: "Ecc", chapters: 12 },
  song: { num: 22, code: "Sng", chapters: 8 },
  isa: { num: 23, code: "Isa", chapters: 66 },
  jer: { num: 24, code: "Jer", chapters: 52 },
  lam: { num: 25, code: "Lam", chapters: 5 },
  ezek: { num: 26, code: "Ezk", chapters: 48 },
  dan: { num: 27, code: "Dan", chapters: 12 },
  hos: { num: 28, code: "Hos", chapters: 14 },
  joel: { num: 29, code: "Jol", chapters: 3 },
  amos: { num: 30, code: "Amo", chapters: 9 },
  obad: { num: 31, code: "Oba", chapters: 1 },
  jonah: { num: 32, code: "Jon", chapters: 4 },
  mic: { num: 33, code: "Mic", chapters: 7 },
  nah: { num: 34, code: "Nam", chapters: 3 },
  hab: { num: 35, code: "Hab", chapters: 3 },
  zeph: { num: 36, code: "Zep", chapters: 3 },
  hag: { num: 37, code: "Hag", chapters: 2 },
  zech: { num: 38, code: "Zec", chapters: 14 },
  mal: { num: 39, code: "Mal", chapters: 4 },
  matt: { num: 40, code: "Mat", chapters: 28 },
  mark: { num: 41, code: "Mrk", chapters: 16 },
  luke: { num: 42, code: "Luk", chapters: 24 },
  john: { num: 43, code: "Jhn", chapters: 21 },
  acts: { num: 44, code: "Act", chapters: 28 },
  rom: { num: 45, code: "Rom", chapters: 16 },
  "1cor": { num: 46, code: "1Co", chapters: 16 },
  "2cor": { num: 47, code: "2Co", chapters: 13 },
  gal: { num: 48, code: "Gal", chapters: 6 },
  eph: { num: 49, code: "Eph", chapters: 6 },
  phil: { num: 50, code: "Php", chapters: 4 },
  col: { num: 51, code: "Col", chapters: 4 },
  "1thes": { num: 52, code: "1Th", chapters: 5 },
  "2thes": { num: 53, code: "2Th", chapters: 3 },
  "1tim": { num: 54, code: "1Ti", chapters: 6 },
  "2tim": { num: 55, code: "2Ti", chapters: 4 },
  titus: { num: 56, code: "Tts", chapters: 3 },
  phlm: { num: 57, code: "Phm", chapters: 1 },
  heb: { num: 58, code: "Heb", chapters: 13 },
  jas: { num: 59, code: "Jas", chapters: 5 },
  "1pet": { num: 60, code: "1Pe", chapters: 5 },
  "2pet": { num: 61, code: "2Pe", chapters: 3 },
  "1john": { num: 62, code: "1Jn", chapters: 5 },
  "2john": { num: 63, code: "2Jn", chapters: 1 },
  "3john": { num: 64, code: "3Jn", chapters: 1 },
  jude: { num: 65, code: "Jud", chapters: 1 },
  rev: { num: 66, code: "Rev", chapters: 22 },
};

function bsbChapter(slug: string, chapter: number): ChapterAudio | null {
  const b = BSB_BOOKS[slug];
  if (b && chapter >= 1 && chapter <= b.chapters) {
    const nn = String(b.num).padStart(2, "0");
    const ccc = String(chapter).padStart(3, "0");
    return fullChapter(
      `https://openbible.com/audio/souer/BSB_${nn}_${b.code}_${ccc}.mp3`,
    );
  }
  // BSB lacks deuterocanon — defer to the WEB recording so listeners on the
  // "English (Modern)" track keep working for apocryphal books.
  return webChapter(slug, chapter);
}

// ── WEB British (ebible.org / Michael Paul Johnson) ─────────────────────────
//
// Deuterocanon only. BSB covers the protocanonical 66 directly; this map fills
// the gap for the apocryphal books reachable via the en_bsb → en_web fallback
// in chapterAudio / bookAudioChapters below.

interface WebBook {
  num: string;
  code: string;
  chapters: number;
  chapterPad?: 2 | 3;
}

const WEB_BOOKS: Record<string, WebBook> = {
  tob: { num: "041", code: "TOB", chapters: 14 },
  jdt: { num: "042", code: "JDT", chapters: 16 },
  wis: { num: "045", code: "WIS", chapters: 19 },
  sir: { num: "046", code: "SIR", chapters: 51 },
  bar: { num: "047", code: "BAR", chapters: 6 },
  "1mac": { num: "052", code: "1MA", chapters: 16 },
  "2mac": { num: "053", code: "2MA", chapters: 15 },
  "1es": { num: "054", code: "1ES", chapters: 9 },
  man: { num: "055", code: "MAN", chapters: 1 },
  "3mac": { num: "057", code: "3MA", chapters: 7 },
  "2es": { num: "058", code: "2ES", chapters: 16 },
  "4mac": { num: "059", code: "4MA", chapters: 18 },
};

function webChapter(slug: string, chapter: number): ChapterAudio | null {
  if (slug === "ps151") {
    return chapter === 1
      ? fullChapter(
          "https://ebible.org/eng-webbe/mp3/eng-webbe_056_Psalm151.mp3",
        )
      : null;
  }
  const b = WEB_BOOKS[slug];
  if (!b || chapter < 1 || chapter > b.chapters) return null;
  const cc = String(chapter).padStart(b.chapterPad ?? 2, "0");
  return fullChapter(
    `https://ebible.org/eng-webbe/mp3/eng-webbe_${b.num}_${b.code}_${cc}.mp3`,
  );
}

// ── KJV (LibriVox per-book solo readings) ───────────────────────────────────
//
// Two flavors:
//   - One MP3 per chapter (KJV_FULL_BOOKS):  direct mapping.
//   - One MP3 spanning multiple chapters (KJV_VIRTUAL via kjv-timing.json):
//     chapter boundaries computed offline by tools/audio/align_kjv.py.

interface KjvBook {
  id: string;
  chapters: number;
  filename: (ch: number) => string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const KJV_FULL_BOOKS: Record<string, KjvBook> = {
  // OT
  josh: {
    id: "bible_kjv_joshua_jc_librivox",
    chapters: 24,
    filename: (c) => `joshua_${pad2(c)}_kjv.mp3`,
  },
  judg: {
    id: "bible_judges_kjv_jc_librivox",
    chapters: 21,
    filename: (c) => `judges_${pad2(c)}_kjv.mp3`,
  },
  "1sam": {
    id: "bible_1samuel_kjv_0903_librivox",
    chapters: 31,
    filename: (c) => `1samuel_${pad2(c)}_kjv.mp3`,
  },
  "2sam": {
    id: "bible_2samuel_kjv_jc_librivox",
    chapters: 24,
    filename: (c) => `2samuel_${pad2(c)}_kjv.mp3`,
  },
  "1kgs": {
    id: "bible_kjv_11_1king_0909_librivox",
    chapters: 22,
    filename: (c) => `1kings_${pad2(c)}_kjv.mp3`,
  },
  "2kgs": {
    id: "bible_kjv_2kings_jc_librivox",
    chapters: 25,
    filename: (c) => `2kings_${pad2(c)}_kjv.mp3`,
  },
  "1chr": {
    id: "1chronicles_jc_librivox",
    chapters: 29,
    filename: (c) => `1chronicles_${pad2(c)}_kjv.mp3`,
  },
  prov: {
    id: "proverbs_kjv_mp_librivox",
    chapters: 31,
    filename: (c) => `proverbs_${pad2(c)}_kjv.mp3`,
  },
  lam: {
    id: "bible_kjv_25_lamentations_mp_0909_librivox",
    chapters: 5,
    filename: (c) => `lamentations_${c}_kjv.mp3`,
  },
  // NT — books with a one-per-chapter solo recording.
  matt: {
    id: "matthew_kjv_mp_librivox",
    chapters: 28,
    filename: (c) => `matthew_${pad2(c)}_kjv.mp3`,
  },
  gal: {
    id: "galatians_kjv_1412_librivox",
    chapters: 6,
    filename: (c) => `galatians_${c}_kjv.mp3`,
  },
  phil: {
    id: "philippians_kjv_vm_librivox",
    chapters: 4,
    filename: (c) => `philippians_${c}_kjv.mp3`,
  },
  phlm: {
    id: "bible_philemon_kjv_1007_librivox",
    chapters: 1,
    filename: () => `philemon_01_kjv.mp3`,
  },
  rev: {
    id: "bible_kjvnt_27_revelation_1401_librivox",
    chapters: 22,
    filename: (c) =>
      `bible_kjvnt_27_revelation_${pad2(c)}_kingjamesversion(kjv).mp3`,
  },
  "1john": {
    id: "bible_epistlesjohn_rt_librivox",
    chapters: 5,
    filename: (c) => `epistlesofjohn_${c}_kjv.mp3`,
  },
  "2john": {
    id: "bible_epistlesjohn_rt_librivox",
    chapters: 1,
    filename: () => `epistlesofjohn_6_kjv.mp3`,
  },
  "3john": {
    id: "bible_epistlesjohn_rt_librivox",
    chapters: 1,
    filename: () => `epistlesofjohn_7_kjv.mp3`,
  },
  // Apocrypha — one-per-chapter only
  tob: {
    id: "tobit_kjv_1512_librivox",
    chapters: 14,
    filename: (c) => `tobit_${pad2(c)}_kjv.mp3`,
  },
  man: {
    id: "prayer_manasseh_ss_librivox",
    chapters: 1,
    filename: () => `prayerofmanasseh_01_kjv.mp3`,
  },
};

// Virtual chapters: source URLs span multiple chapters. Timing data is
// produced by tools/audio/align_kjv.py and shipped as JSON. Each entry is
// keyed "<book>:<chapter>" → { source_url, start_sec, end_sec }.
interface KjvTimingEntry {
  source_url: string;
  start_sec: number;
  end_sec: number;
}
const KJV_VIRTUAL: Record<string, KjvTimingEntry> = kjvTimingJson as Record<
  string,
  KjvTimingEntry
>;

function kjvChapter(slug: string, chapter: number): ChapterAudio | null {
  // Prefer the timing table — it covers both multi-chapter and per-chapter
  // files, with boundaries that exclude LibriVox intro/outro boilerplate.
  const virtual = KJV_VIRTUAL[`${slug}:${chapter}`];
  if (virtual) {
    return {
      sourceUrl: virtual.source_url,
      sourceFilename: basename(virtual.source_url),
      startSec: virtual.start_sec,
      endSec: virtual.end_sec,
    };
  }
  // Fallback for books not yet in the timing table (plays full file,
  // including any LibriVox intro/outro — will go away once all books
  // are aligned via tools/audio/align_kjv.py --force).
  const full = KJV_FULL_BOOKS[slug];
  if (full && chapter >= 1 && chapter <= full.chapters) {
    return fullChapter(
      `https://archive.org/download/${full.id}/${full.filename(chapter)}`,
    );
  }
  return null;
}

function kjvBookChapters(slug: string): number {
  const full = KJV_FULL_BOOKS[slug];
  if (full) return full.chapters;
  // Otherwise check virtual: count distinct chapters in the timing table.
  let max = 0;
  const prefix = `${slug}:`;
  for (const k of Object.keys(KJV_VIRTUAL)) {
    if (k.startsWith(prefix)) {
      const n = Number(k.slice(prefix.length));
      if (n > max) max = n;
    }
  }
  return max;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function chapterAudio(
  translation: AudioTranslation,
  bookSlug: string,
  chapter: number,
): ChapterAudio | null {
  switch (translation) {
    case "en_bsb":
      return bsbChapter(bookSlug, chapter);
    case "en_web":
      return webChapter(bookSlug, chapter);
    case "en_kjv":
      return kjvChapter(bookSlug, chapter);
  }
}

function webBookChapters(bookSlug: string): number {
  if (bookSlug === "ps151") return 1;
  return WEB_BOOKS[bookSlug]?.chapters ?? 0;
}

export function bookAudioChapters(
  translation: AudioTranslation,
  bookSlug: string,
): number {
  switch (translation) {
    case "en_bsb": {
      const direct = BSB_BOOKS[bookSlug]?.chapters ?? 0;
      // Mirror the bsbChapter fallback: deuterocanon counts come from WEB.
      return direct > 0 ? direct : webBookChapters(bookSlug);
    }
    case "en_web":
      return webBookChapters(bookSlug);
    case "en_kjv":
      return kjvBookChapters(bookSlug);
  }
}

export function bookHasAudio(
  translation: AudioTranslation,
  bookSlug: string,
): boolean {
  return bookAudioChapters(translation, bookSlug) > 0;
}
