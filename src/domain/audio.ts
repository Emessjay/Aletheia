// Audio narration manifest.
//
// For each (translation, book_slug) we resolve a chapter MP3 URL via a
// deterministic generator (BSB, WEB) or a hand-curated archive.org catalog
// (KJV per-book LibriVox solo readings). All sources are CC0 / Public Domain.
//
// Coverage matrix (all readers public domain):
//   BSB (en_bsb): OT + NT, Bob Souer (openbible.com)
//   WEB (en_web): OT + NT + Deuterocanon, Michael Paul Johnson (ebible.org)
//   KJV (en_kjv): best-effort, per-book LibriVox volunteer readings (archive.org)

import type { CorpusLanguage } from "@/db/types";

export type AudioTranslation = "en_bsb" | "en_kjv" | "en_web";

export interface AudioSourceInfo {
  translation: AudioTranslation;
  label: string; // shown in player UI
  narrator: string;
  license: string;
  sourceUrl: string; // landing page for credit screen
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
    label: "World English Bible (British)",
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

/** True if `lang` can be used for audio playback (subset of CorpusLanguage). */
export function isAudioTranslation(lang: CorpusLanguage): lang is AudioTranslation {
  return lang === "en_bsb" || lang === "en_kjv" || lang === "en_web";
}

// ── BSB (openbible.com / Bob Souer) ─────────────────────────────────────────
//
// URL: https://openbible.com/audio/souer/BSB_{NN}_{Code}_{CCC}.mp3
// NN  = zero-padded book number (01..66)
// Code = 3-letter code (Gen, Exo, Lev, ..., Rev) — case-sensitive
// CCC = zero-padded 3-digit chapter

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

function bsbUrl(slug: string, chapter: number): string | null {
  const b = BSB_BOOKS[slug];
  if (!b || chapter < 1 || chapter > b.chapters) return null;
  const nn = String(b.num).padStart(2, "0");
  const ccc = String(chapter).padStart(3, "0");
  return `https://openbible.com/audio/souer/BSB_${nn}_${b.code}_${ccc}.mp3`;
}

// ── WEB British (ebible.org / Michael Paul Johnson) ─────────────────────────
//
// URL: https://ebible.org/eng-webbe/mp3/eng-webbe_{NNN}_{CODE}_{CC}.mp3
// Psalms uses CCC (3-digit) since it has 150 chapters.
// Psalm 151 is a one-off file:  eng-webbe_056_Psalm151.mp3

interface WebBook {
  num: string; // 3-digit string from ebible filename, e.g. "002"
  code: string; // 3-letter uppercase code, e.g. "GEN"
  chapters: number;
  chapterPad?: 2 | 3; // default 2; 3 for Psalms
}

const WEB_BOOKS: Record<string, WebBook> = {
  // OT (Protestant)
  gen: { num: "002", code: "GEN", chapters: 50 },
  exod: { num: "003", code: "EXO", chapters: 40 },
  lev: { num: "004", code: "LEV", chapters: 27 },
  num: { num: "005", code: "NUM", chapters: 36 },
  deut: { num: "006", code: "DEU", chapters: 34 },
  josh: { num: "007", code: "JOS", chapters: 24 },
  judg: { num: "008", code: "JDG", chapters: 21 },
  ruth: { num: "009", code: "RUT", chapters: 4 },
  "1sam": { num: "010", code: "1SA", chapters: 31 },
  "2sam": { num: "011", code: "2SA", chapters: 24 },
  "1kgs": { num: "012", code: "1KI", chapters: 22 },
  "2kgs": { num: "013", code: "2KI", chapters: 25 },
  "1chr": { num: "014", code: "1CH", chapters: 29 },
  "2chr": { num: "015", code: "2CH", chapters: 36 },
  ezra: { num: "016", code: "EZR", chapters: 10 },
  neh: { num: "017", code: "NEH", chapters: 13 },
  esth: { num: "018", code: "EST", chapters: 10 },
  job: { num: "019", code: "JOB", chapters: 42 },
  ps: { num: "020", code: "PSA", chapters: 150, chapterPad: 3 },
  prov: { num: "021", code: "PRO", chapters: 31 },
  eccl: { num: "022", code: "ECC", chapters: 12 },
  song: { num: "023", code: "SNG", chapters: 8 },
  isa: { num: "024", code: "ISA", chapters: 66 },
  jer: { num: "025", code: "JER", chapters: 52 },
  lam: { num: "026", code: "LAM", chapters: 5 },
  ezek: { num: "027", code: "EZK", chapters: 48 },
  // Our `dan` slug carries 14 chapters (Greek additions merged), matching
  // ebible's DAG file rather than the 12-chapter DAN file.
  dan: { num: "066", code: "DAG", chapters: 14 },
  hos: { num: "029", code: "HOS", chapters: 14 },
  joel: { num: "030", code: "JOL", chapters: 3 },
  amos: { num: "031", code: "AMO", chapters: 9 },
  obad: { num: "032", code: "OBA", chapters: 1 },
  jonah: { num: "033", code: "JON", chapters: 4 },
  mic: { num: "034", code: "MIC", chapters: 7 },
  nah: { num: "035", code: "NAM", chapters: 3 },
  hab: { num: "036", code: "HAB", chapters: 3 },
  zeph: { num: "037", code: "ZEP", chapters: 3 },
  hag: { num: "038", code: "HAG", chapters: 2 },
  zech: { num: "039", code: "ZEC", chapters: 14 },
  mal: { num: "040", code: "MAL", chapters: 4 },
  // NT
  matt: { num: "070", code: "MAT", chapters: 28 },
  mark: { num: "071", code: "MRK", chapters: 16 },
  luke: { num: "072", code: "LUK", chapters: 24 },
  john: { num: "073", code: "JHN", chapters: 21 },
  acts: { num: "074", code: "ACT", chapters: 28 },
  rom: { num: "075", code: "ROM", chapters: 16 },
  "1cor": { num: "076", code: "1CO", chapters: 16 },
  "2cor": { num: "077", code: "2CO", chapters: 13 },
  gal: { num: "078", code: "GAL", chapters: 6 },
  eph: { num: "079", code: "EPH", chapters: 6 },
  phil: { num: "080", code: "PHP", chapters: 4 },
  col: { num: "081", code: "COL", chapters: 4 },
  "1thes": { num: "082", code: "1TH", chapters: 5 },
  "2thes": { num: "083", code: "2TH", chapters: 3 },
  "1tim": { num: "084", code: "1TI", chapters: 6 },
  "2tim": { num: "085", code: "2TI", chapters: 4 },
  titus: { num: "086", code: "TIT", chapters: 3 },
  phlm: { num: "087", code: "PHM", chapters: 1 },
  heb: { num: "088", code: "HEB", chapters: 13 },
  jas: { num: "089", code: "JAS", chapters: 5 },
  "1pet": { num: "090", code: "1PE", chapters: 5 },
  "2pet": { num: "091", code: "2PE", chapters: 3 },
  "1john": { num: "092", code: "1JN", chapters: 5 },
  "2john": { num: "093", code: "2JN", chapters: 1 },
  "3john": { num: "094", code: "3JN", chapters: 1 },
  jude: { num: "095", code: "JUD", chapters: 1 },
  rev: { num: "096", code: "REV", chapters: 22 },
  // Deuterocanon
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

function webUrl(slug: string, chapter: number): string | null {
  // Psalm 151 is a one-file outlier.
  if (slug === "ps151") {
    return chapter === 1
      ? "https://ebible.org/eng-webbe/mp3/eng-webbe_056_Psalm151.mp3"
      : null;
  }
  const b = WEB_BOOKS[slug];
  if (!b || chapter < 1 || chapter > b.chapters) return null;
  const cc = String(chapter).padStart(b.chapterPad ?? 2, "0");
  return `https://ebible.org/eng-webbe/mp3/eng-webbe_${b.num}_${b.code}_${cc}.mp3`;
}

// ── KJV (LibriVox per-book solo readings) ───────────────────────────────────
//
// Each book lives in its own archive.org item with its own filename template.
// Catalog is hand-curated from archive.org's LibriVox collection — books
// without a single-reader, one-chapter-per-file solo project are omitted and
// will report as "no audio" in the player.
//
// URL: https://archive.org/download/{id}/{filename(ch)}
//
// `filename(ch)` is a function so we can encode each item's local convention:
// some use 64kb suffix, some don't; some zero-pad to 2 digits, some don't.

interface KjvBook {
  id: string; // archive.org item identifier
  chapters: number;
  filename: (ch: number) => string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Only books whose archive.org item has one MP3 file per chapter make it
// into the catalog. Many LibriVox per-book KJV recordings group several
// chapters per file (e.g. Job is 22 files over 42 chapters), and those are
// unusable for chapter-level playback — they're omitted here, so the player
// will report "no audio for this book" rather than mis-aligning playback.
// Filenames have been verified against the archive.org metadata API; the
// padding and stem conventions vary item-by-item (some zero-pad, some don't,
// some encode the project's book name into the filename).
const KJV_BOOKS: Record<string, KjvBook> = {
  // OT — verified one-file-per-chapter
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
  // NT — most LibriVox KJV NT solos pack multiple chapters per file; only
  // these have one-per-chapter.
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
  // 1, 2, & 3 John share an archive item that numbers files sequentially
  // 1..7: 1Jn chapters 1-5 = files 1-5, 2Jn chapter 1 = file 6, 3Jn chapter
  // 1 = file 7. Encode the offset directly.
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
  // KJV Apocrypha — only Tobit and Prayer of Manasseh have clean per-chapter
  // single-reader recordings. 1/2 Maccabees, Judith, Wisdom etc. exist on
  // LibriVox but pack multiple chapters per file.
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

function kjvUrl(slug: string, chapter: number): string | null {
  const b = KJV_BOOKS[slug];
  if (!b || chapter < 1 || chapter > b.chapters) return null;
  return `https://archive.org/download/${b.id}/${b.filename(chapter)}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Resolve the upstream MP3 URL for one chapter. Returns null if no audio
 *  source covers this (translation, book, chapter). */
export function chapterAudioUrl(
  translation: AudioTranslation,
  bookSlug: string,
  chapter: number,
): string | null {
  switch (translation) {
    case "en_bsb":
      return bsbUrl(bookSlug, chapter);
    case "en_web":
      return webUrl(bookSlug, chapter);
    case "en_kjv":
      return kjvUrl(bookSlug, chapter);
  }
}

/** Total chapter count covered by audio for (translation, book) — or 0 if the
 *  source has no recording for that book. */
export function bookAudioChapters(
  translation: AudioTranslation,
  bookSlug: string,
): number {
  switch (translation) {
    case "en_bsb":
      return BSB_BOOKS[bookSlug]?.chapters ?? 0;
    case "en_web":
      if (bookSlug === "ps151") return 1;
      return WEB_BOOKS[bookSlug]?.chapters ?? 0;
    case "en_kjv":
      return KJV_BOOKS[bookSlug]?.chapters ?? 0;
  }
}

/** True when at least one audio chapter is available for (translation, book). */
export function bookHasAudio(
  translation: AudioTranslation,
  bookSlug: string,
): boolean {
  return bookAudioChapters(translation, bookSlug) > 0;
}
