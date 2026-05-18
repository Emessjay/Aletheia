#!/usr/bin/env python3
"""Parse Project Gutenberg plain-text Luther biblical commentaries into the
verse-keyed JSON shape the ingest pipeline already accepts via
SwordCommentaryParser:

    [{"book": "Galatians", "osis": "Gal", "chapter": 1, "verse": 1,
      "body": "..."}, ...]

Four PG sources, three verse-marker dialects:

  - #1549  Galatians (Graebner trans.)        CHAPTER N         VERSE N.
  - #29678 1 Peter / 2 Peter / Jude (Lenker)  CHAPTER I./II./...  V. N. or V. N, M. or V. N-M.
  - #48193 Genesis vol. 1 (creation)          CHAPTER I./II./...  V. Na. _scripture._
  - #27978 Genesis vol. 2 (sin & flood)       (same as vol. 1, continuing chapter numbering)

Each source has its own book-routing rule (some files contain multiple books;
Genesis volumes share one book but split at different chapter numbers).

Output is a single merged luther.json suitable for ingestSwordCommentary.

Verse-range markers (V. 1, 2., V. 1-6.) are anchored at their LOW verse, so a
single record carries the whole block. The body itself preserves the range
header ("V. 1-6. _scripture..._") so the user sees the original anchor.

Repeated verse markers (Luther often revisits a verse in a later pass) produce
multiple records — SwordCommentaryParser already handles that by appending
each record as its own labeled section under the chapter view.

US-PD status:
  - #1549 (Graebner 1937) is PD in the US by copyright non-renewal — PG vetted
    via the Stanford Copyright Renewal Database. Non-US distribution may still
    be restricted.
  - #29678 (Lenker, 1904), #48193 (Lenker, 1904), #27978 (Lenker, 1910) are PD
    by age in the US.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


# -----------------------------------------------------------------------------
# Verse-marker dialects
# -----------------------------------------------------------------------------

# Galatians (PG #1549): "  VERSE 1." style, indented two spaces.
RE_VERSE_GAL = re.compile(r"^\s*VERSE\s+(\d+)\.?\s*", re.IGNORECASE)

# Peter/Jude + Genesis: "V. 1." | "V. 1, 2." | "V. 1-6." | "V. 2a." | etc.
# Captures the first integer (the anchor) and ignores the rest of the range.
RE_VERSE_LENKER = re.compile(
    r"^V\.\s*(\d+)(?:[a-z])?(?:\s*[,\-]\s*\d+(?:[a-z])?)?\.?\s*",
)

# Chapter markers come in two flavors. Some volumes use Arabic ("CHAPTER 1"),
# others Roman numerals with trailing period ("CHAPTER I.").
RE_CHAPTER_ARABIC = re.compile(r"^CHAPTER\s+(\d+)\.?\s*$")
RE_CHAPTER_ROMAN = re.compile(r"^CHAPTER\s+([IVXLCDM]+)\.?\s*$")


def roman_to_int(s: str) -> int:
    vals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total, prev = 0, 0
    for ch in reversed(s.upper()):
        v = vals[ch]
        total += -v if v < prev else v
        prev = v
    return total


# -----------------------------------------------------------------------------
# Source descriptors
# -----------------------------------------------------------------------------

@dataclass
class BookSection:
    """One biblical book covered inside a PG source file.

    `book`/`osis` are the destination labels. `start_header` is a regex that
    matches the line announcing this book inside the PG text; everything from
    that header until the next book's header (or EOF) is parsed as this book's
    text. `chapter_offset` lets Genesis vol. 2 continue chapter numbering past
    where vol. 1 stopped.
    """

    book: str
    osis: str
    start_header: re.Pattern[str]
    chapter_offset: int = 0


@dataclass
class Source:
    pg_id: int
    label: str
    verse_re: re.Pattern[str]
    chapter_re: re.Pattern[str]
    chapter_arabic: bool
    books: list[BookSection]


SOURCES: dict[str, Source] = {
    "galatians": Source(
        pg_id=1549,
        label="Galatians (Graebner trans.)",
        verse_re=RE_VERSE_GAL,
        chapter_re=RE_CHAPTER_ARABIC,
        chapter_arabic=True,
        books=[
            BookSection(
                book="Galatians",
                osis="Gal",
                # The commentary proper begins right after the page-break line
                # "CHAPTER 1" — we anchor the body at the start of file and let
                # the chapter scanner do the work. Use a header that matches
                # the title block so anything before it is treated as frontmatter.
                start_header=re.compile(r"^COMMENTARY ON THE EPISTLE TO THE GALATIANS"),
            ),
        ],
    ),
    "peter-jude": Source(
        pg_id=29678,
        label="1 Peter, 2 Peter, Jude (Lenker trans., 1904)",
        verse_re=RE_VERSE_LENKER,
        chapter_re=RE_CHAPTER_ROMAN,
        chapter_arabic=False,
        books=[
            BookSection(
                book="1 Peter",
                osis="1Pet",
                start_header=re.compile(r"^THE FIRST EPISTLE GENERAL OF ST\. PETER\.?$"),
            ),
            BookSection(
                book="2 Peter",
                osis="2Pet",
                start_header=re.compile(r"^THE SECOND EPISTLE GENERAL OF ST\. PETER\.?$"),
            ),
            BookSection(
                book="Jude",
                osis="Jude",
                start_header=re.compile(r"^THE EPISTLE OF SAINT JUDE\.?$"),
            ),
        ],
    ),
    "genesis-vol1": Source(
        pg_id=48193,
        label="Genesis vol. 1 (creation, Lenker trans.)",
        verse_re=RE_VERSE_LENKER,
        chapter_re=RE_CHAPTER_ROMAN,
        chapter_arabic=False,
        books=[
            BookSection(
                book="Genesis",
                osis="Gen",
                start_header=re.compile(r"^CHAPTER I\.?$"),
            ),
        ],
    ),
    "genesis-vol2": Source(
        pg_id=27978,
        label="Genesis vol. 2 (sin & flood, Lenker trans.)",
        verse_re=RE_VERSE_LENKER,
        chapter_re=RE_CHAPTER_ROMAN,
        chapter_arabic=False,
        books=[
            # Vol. 2's CHAPTER markers are Bible chapters (IV-IX = Gen 4–9),
            # picking up partway through Gen 4 where vol. 1 left off, so no
            # chapter_offset rebasing is needed.
            BookSection(
                book="Genesis",
                osis="Gen",
                start_header=re.compile(r"^CHAPTER IV\.?$"),
            ),
        ],
    ),
}


# Jude has no chapter markers in scripture — but Luther's text doesn't issue a
# "CHAPTER I" before Jude's verses either; the verses appear directly under
# the book header. Whenever the book section never sees a chapter marker, we
# pin its verses to chapter 1.


# -----------------------------------------------------------------------------
# Parser
# -----------------------------------------------------------------------------

PG_START_RE = re.compile(r"^\*\*\* START OF THE PROJECT GUTENBERG EBOOK\b", re.IGNORECASE)
PG_END_RE = re.compile(r"^\*\*\* END OF THE PROJECT GUTENBERG EBOOK\b", re.IGNORECASE)


def strip_pg_boilerplate(text: str) -> str:
    """Trim everything before *** START *** and after *** END ***."""
    lines = text.splitlines()
    start, end = 0, len(lines)
    for i, line in enumerate(lines):
        if PG_START_RE.match(line):
            start = i + 1
            break
    for i, line in enumerate(lines):
        if PG_END_RE.match(line):
            end = i
            break
    return "\n".join(lines[start:end])


@dataclass
class Block:
    """One verse-anchored block of prose."""

    chapter: int
    verse: int
    body_lines: list[str]


def parse_book_section(
    body: str,
    *,
    verse_re: re.Pattern[str],
    chapter_re: re.Pattern[str],
    chapter_arabic: bool,
    chapter_offset: int,
) -> list[Block]:
    """Walk a slice of PG text and emit one Block per (chapter, verse) anchor.

    Lines before the first verse marker are dropped (book/chapter front matter
    that doesn't belong on any particular verse). Lines inside a verse block
    are accumulated until the next verse or chapter marker.
    """
    blocks: list[Block] = []
    current: Block | None = None
    chapter = 0  # 0 = no chapter seen yet; verses in Jude default to chapter 1.

    for line in body.splitlines():
        m = chapter_re.match(line)
        if m:
            raw = m.group(1)
            n = int(raw) if chapter_arabic else roman_to_int(raw)
            chapter = n + chapter_offset
            # End any open block — the chapter header isn't body text.
            if current is not None:
                blocks.append(current)
                current = None
            continue

        m = verse_re.match(line)
        if m:
            if current is not None:
                blocks.append(current)
            verse = int(m.group(1))
            # If we hit a verse before any chapter marker (Jude case), pin to 1.
            ch = chapter if chapter > 0 else 1
            current = Block(chapter=ch, verse=verse, body_lines=[line])
            continue

        if current is not None:
            current.body_lines.append(line)

    if current is not None:
        blocks.append(current)

    return blocks


def find_book_slices(text: str, books: list[BookSection]) -> list[tuple[BookSection, str]]:
    """Carve the source text into one (BookSection, body) slice per book.

    For a single-book source, returns one slice spanning the whole text.
    For multi-book sources, splits at each book's start_header.
    """
    if len(books) == 1:
        return [(books[0], text)]

    lines = text.splitlines()
    starts: list[int] = []
    for book in books:
        for i, line in enumerate(lines):
            if book.start_header.match(line):
                starts.append(i)
                break
        else:
            print(f"warning: header for {book.book} not found", file=sys.stderr)
            starts.append(len(lines))

    slices = []
    for i, book in enumerate(books):
        lo = starts[i]
        hi = starts[i + 1] if i + 1 < len(starts) else len(lines)
        slices.append((book, "\n".join(lines[lo:hi])))
    return slices


def clean_body(lines: list[str]) -> str:
    """Tidy a block's accumulated lines: strip trailing blank padding, join."""
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).strip()


def parse_source(name: str, raw_text: str) -> Iterator[dict]:
    src = SOURCES[name]
    text = strip_pg_boilerplate(raw_text)
    for book, body in find_book_slices(text, src.books):
        blocks = parse_book_section(
            body,
            verse_re=src.verse_re,
            chapter_re=src.chapter_re,
            chapter_arabic=src.chapter_arabic,
            chapter_offset=book.chapter_offset,
        )
        for blk in blocks:
            body_text = clean_body(blk.body_lines)
            if not body_text:
                continue
            yield {
                "book": book.book,
                "osis": book.osis,
                "chapter": blk.chapter,
                "verse": blk.verse,
                "body": body_text,
            }


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input-dir",
        required=True,
        type=Path,
        help="Directory containing pg<id>.txt files for each source.",
    )
    p.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output JSON path.",
    )
    args = p.parse_args()

    all_records: list[dict] = []
    for name, src in SOURCES.items():
        path = args.input_dir / f"pg{src.pg_id}.txt"
        if not path.exists():
            print(f"missing source: {path}", file=sys.stderr)
            return 1
        raw = path.read_text(encoding="utf-8")
        records = list(parse_source(name, raw))
        print(f"{name:14s} {src.label:50s} {len(records):5d} blocks", file=sys.stderr)
        all_records.extend(records)

    args.out.write_text(json.dumps(all_records, ensure_ascii=False, indent=None))
    print(f"wrote {len(all_records)} records to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
