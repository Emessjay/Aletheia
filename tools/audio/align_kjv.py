#!/usr/bin/env python3
"""Align chapter boundaries for multi-chapter LibriVox KJV recordings.

Many LibriVox KJV solo recordings pack two or more chapters into each MP3
file (e.g. Mark is 8 files for 16 chapters, with each file covering two
consecutive chapters). To support per-chapter playback in Aletheia without
re-hosting split files, we use aeneas to compute the chapter start
timestamps within each source MP3, then ship a JSON manifest that the
runtime player consults to seek into the right segment.

Output: data/audio/kjv-timing.json with one entry per (book, chapter)
giving the source URL, start seconds, and end seconds.

Usage (from repo root, in the aeneas venv):

    source /tmp/aeneas-venv/bin/activate
    python tools/audio/align_kjv.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

# Lazy-import aeneas so `--list` etc. work without the venv loaded.
def _aeneas():
    from aeneas.executetask import ExecuteTask
    from aeneas.task import Task

    return ExecuteTask, Task


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
OUT_FILE = DATA_DIR / "audio" / "kjv-timing.json"
CORPUS_DB = DATA_DIR / "Aletheia.sqlite"
CACHE_DIR = Path(tempfile.gettempdir()) / "aletheia-align-cache"


@dataclass
class SourceFile:
    """One MP3 in a LibriVox archive item, covering one or more chapters."""

    filename: str
    chapter_start: int
    chapter_end: int  # inclusive


@dataclass
class BookSource:
    slug: str  # corpus book slug (e.g. "mark")
    archive_id: str
    files: list[SourceFile]


# Multi-chapter LibriVox KJV sources for NT + Apocrypha. Chapter ranges
# come from the archive.org file titles, which all follow consistent
# "Chapter X - Y" formats — verified by hand against the metadata API.
SOURCES: list[BookSource] = [
    BookSource(
        "mark",
        "mark_kjv_sw_librivox",
        [SourceFile(f"gospelofmark_{i:02d}_kjv.mp3", 2 * i - 1, 2 * i) for i in range(1, 9)],
    ),
    BookSource(
        "luke",
        "bible_kjv_nt_03_luke_0812_librivox",
        [SourceFile(f"luke_{2*i-1:02d}-{2*i:02d}_kjv.mp3", 2 * i - 1, 2 * i) for i in range(1, 13)],
    ),
    BookSource(
        "john",
        "biblent04_john_kjv_librivox",
        [
            SourceFile("gospeljohn_1_kjv.mp3", 1, 4),
            SourceFile("gospeljohn_2_kjv.mp3", 5, 8),
            SourceFile("gospeljohn_3_kjv.mp3", 9, 12),
            SourceFile("gospeljohn_4_kjv.mp3", 13, 17),
            SourceFile("gospeljohn_5_kjv.mp3", 18, 21),
        ],
    ),
    BookSource(
        "acts",
        "acts_kjv_1112_librivox",
        [
            SourceFile("acts_01_kjv.mp3", 1, 3),
            SourceFile("acts_02_kjv.mp3", 4, 6),
            SourceFile("acts_03_kjv.mp3", 7, 8),
            SourceFile("acts_04_kjv.mp3", 9, 11),
            SourceFile("acts_05_kjv.mp3", 12, 14),
            SourceFile("acts_06_kjv.mp3", 15, 17),
            SourceFile("acts_07_kjv.mp3", 18, 20),
            SourceFile("acts_08_kjv.mp3", 21, 23),
            SourceFile("acts_09_kjv.mp3", 24, 24),
            SourceFile("acts_10_kjv.mp3", 25, 26),
            SourceFile("acts_11_kjv.mp3", 27, 28),
        ],
    ),
    BookSource(
        "rom",
        "romans_kjv_1103_librivox",
        [SourceFile(f"romans_{i}_kjv.mp3", 2 * i - 1, 2 * i) for i in range(1, 9)],
    ),
    BookSource(
        "1cor",
        "1corinthians_kjv_1103_librivox",
        [SourceFile(f"1corinthians_{i}_kjv.mp3", 2 * i - 1, 2 * i) for i in range(1, 9)],
    ),
    BookSource(
        "2cor",
        "2corinthians_kjv_1105_librivox",
        [
            SourceFile("2corinthians_1_kjv.mp3", 1, 2),
            SourceFile("2corinthians_2_kjv.mp3", 3, 4),
            SourceFile("2corinthians_3_kjv.mp3", 5, 6),
            SourceFile("2corinthians_4_kjv.mp3", 7, 8),
            SourceFile("2corinthians_5_kjv.mp3", 9, 10),
            SourceFile("2corinthians_6_kjv.mp3", 11, 11),
            SourceFile("2corinthians_7_kjv.mp3", 12, 13),
        ],
    ),
    BookSource(
        "eph",
        "ephesians_kjv_nt_librivox",
        [SourceFile("ephesians_kjv.mp3", 1, 6)],
    ),
    BookSource(
        "1thes",
        "bible_1thessalonians_kjv_1010_librivox",
        [SourceFile("1_thessalonians_01_kjv.mp3", 1, 5)],
    ),
    BookSource(
        "2thes",
        "bible_2thessalonians_kjv_1011_librivox",
        [SourceFile("2_thessalonians_kjv.mp3", 1, 3)],
    ),
    BookSource(
        "1tim",
        "bible_1timothy_kjv_1007_librivox",
        [
            SourceFile("1_timothy_01_kjv.mp3", 1, 3),
            SourceFile("1_timothy_02_kjv.mp3", 4, 6),
        ],
    ),
    BookSource(
        "2tim",
        "bible_2timothy_kjv_1009_librivox",
        [SourceFile("2_timothy_01_kjv.mp3", 1, 4)],
    ),
    BookSource(
        "titus",
        "bible_titus_kjv_1007_librivox",
        [SourceFile("titus_01_kjv.mp3", 1, 3)],
    ),
    BookSource(
        "heb",
        "hebrews_kjv_1111_librivox",
        [
            SourceFile("hebrews_1_kjv.mp3", 1, 3),
            SourceFile("hebrews_2_kjv.mp3", 4, 6),
            SourceFile("hebrews_3_kjv.mp3", 7, 9),
            SourceFile("hebrews_4_kjv.mp3", 10, 11),
            SourceFile("hebrews_5_kjv.mp3", 12, 13),
        ],
    ),
    BookSource(
        "1pet",
        "epistlesofpeter_kjv_1109_librivox",
        [SourceFile("epistlesofpeter_1_kjv.mp3", 1, 5)],
    ),
    BookSource(
        "2pet",
        "epistlesofpeter_kjv_1109_librivox",
        [SourceFile("epistlesofpeter_2_kjv.mp3", 1, 3)],
    ),
    # Apocrypha
    BookSource(
        "jdt",
        "bookofjudith_2007_librivox",
        [
            SourceFile("bookofjudith_01_kjv.mp3", 1, 5),
            SourceFile("bookofjudith_02_kjv.mp3", 6, 10),
            SourceFile("bookofjudith_03_kjv.mp3", 11, 16),
        ],
    ),
    BookSource(
        "wis",
        "wisdom_of_solomon_kjv_1407_librivox",
        [
            SourceFile("wisdomofsolomon_01_kjv.mp3", 1, 7),
            SourceFile("wisdomofsolomon_02_kjv.mp3", 8, 13),
            SourceFile("wisdomofsolomon_03_kjv.mp3", 14, 19),
        ],
    ),
    BookSource(
        "1mac",
        "1maccabees_2005_librivox",
        [
            SourceFile("maccabees1_01_kjv.mp3", 1, 5),
            SourceFile("maccabees1_02_kjv.mp3", 6, 10),
            SourceFile("maccabees1_03_kjv.mp3", 11, 16),
        ],
    ),
    BookSource(
        "2mac",
        "2maccabees_2005_librivox",
        [
            SourceFile("maccabees2_01_kjv.mp3", 1, 5),
            SourceFile("maccabees2_02_kjv.mp3", 6, 10),
            SourceFile("maccabees2_03_kjv.mp3", 11, 15),
        ],
    ),
]


def archive_url(archive_id: str, filename: str) -> str:
    return f"https://archive.org/download/{archive_id}/{filename}"


def fetch_chapter_text(con: sqlite3.Connection, slug: str, chapter: int) -> str:
    """Return the KJV plain text of one chapter (verses joined by spaces).

    For alignment purposes we collapse verse boundaries — aeneas needs a flat
    chunk of prose per fragment. Punctuation and case are kept so the espeak
    synthesizer doesn't mis-align on names.
    """
    cur = con.execute(
        """
        SELECT v.text_plain
          FROM verse v
          JOIN chapter c ON c.id = v.chapter_id
          JOIN book b ON b.id = c.book_id
         WHERE b.language = 'en_kjv'
           AND b.slug = ?
           AND c.number = ?
         ORDER BY v.number
        """,
        (slug, chapter),
    )
    rows = cur.fetchall()
    if not rows:
        raise RuntimeError(f"no KJV text for {slug} chapter {chapter}")
    return " ".join(r[0] for r in rows)


def download_to_cache(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, tmp.open("wb") as f:
        shutil.copyfileobj(r, f)
    tmp.rename(dest)


def align_file(mp3: Path, chapter_texts: list[str]) -> list[tuple[float, float]]:
    """Run aeneas on a single MP3 with one fragment per chapter.

    Returns a list of (start_sec, end_sec) tuples in chapter order.
    """
    ExecuteTask, Task = _aeneas()

    with tempfile.TemporaryDirectory() as td_str:
        td = Path(td_str)
        text_file = td / "text.txt"
        # is_text_type=plain treats each non-empty line as one fragment.
        # We additionally collapse any embedded newlines in the chapter text.
        text_file.write_text(
            "\n".join(re.sub(r"\s+", " ", t).strip() for t in chapter_texts) + "\n",
            encoding="utf-8",
        )
        sync_file = td / "sync.json"

        config = "task_language=eng|os_task_file_format=json|is_text_type=plain"
        task = Task(config_string=config)
        task.audio_file_path_absolute = str(mp3)
        task.text_file_path_absolute = str(text_file)
        task.sync_map_file_path_absolute = str(sync_file)
        ExecuteTask(task).execute()
        task.output_sync_map_file()

        data = json.loads(sync_file.read_text())
        out = []
        for frag in data["fragments"]:
            out.append((float(frag["begin"]), float(frag["end"])))
        if len(out) != len(chapter_texts):
            raise RuntimeError(
                f"aeneas returned {len(out)} fragments, expected {len(chapter_texts)}"
            )
        return out


def main() -> int:
    if not CORPUS_DB.exists():
        print(f"corpus DB not found at {CORPUS_DB}", file=sys.stderr)
        return 1
    con = sqlite3.connect(CORPUS_DB)
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Resume support: load existing JSON so we can re-run after a crash and
    # skip work that's already done. Keyed by `<book>:<chapter>`.
    existing: dict[str, dict] = {}
    if OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text())
        except Exception:
            existing = {}

    output: dict[str, dict] = dict(existing)

    for src in SOURCES:
        print(f"\n=== {src.slug} ({src.archive_id}) ===")
        for sf in src.files:
            url = archive_url(src.archive_id, sf.filename)
            # Skip if every chapter this file covers is already aligned to it.
            covered = [
                ch
                for ch in range(sf.chapter_start, sf.chapter_end + 1)
                if f"{src.slug}:{ch}" in output
                and output[f"{src.slug}:{ch}"].get("source_url") == url
            ]
            if len(covered) == sf.chapter_end - sf.chapter_start + 1:
                print(f"  {sf.filename}: already aligned, skipping")
                continue

            mp3 = CACHE_DIR / src.archive_id / sf.filename
            try:
                download_to_cache(url, mp3)
            except Exception as e:
                print(f"  ERROR downloading {url}: {e}", file=sys.stderr)
                continue

            chapter_texts = [
                fetch_chapter_text(con, src.slug, ch)
                for ch in range(sf.chapter_start, sf.chapter_end + 1)
            ]
            print(
                f"  aligning {sf.filename} ({sf.chapter_start}-{sf.chapter_end})"
            )
            try:
                spans = align_file(mp3, chapter_texts)
            except Exception as e:
                print(f"  ERROR aligning {sf.filename}: {e}", file=sys.stderr)
                continue

            for ch, (start, end) in zip(
                range(sf.chapter_start, sf.chapter_end + 1), spans
            ):
                output[f"{src.slug}:{ch}"] = {
                    "source_url": url,
                    "start_sec": round(start, 3),
                    "end_sec": round(end, 3),
                }
            # Persist after each file so a crash doesn't lose progress.
            OUT_FILE.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n")

    con.close()
    print(f"\nwrote {len(output)} chapter timings to {OUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
