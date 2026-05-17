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

# Standard LibriVox intro/outro boilerplate used as boundary-absorbing
# fragments.  The exact wording varies by reader, but aeneas DTW is
# tolerant of approximate matches — what matters is having a fragment
# boundary so the intro/outro speech doesn't bleed into the first/last
# chapter's timing.
LIBRIVOX_INTRO = (
    "This is a LibriVox recording. "
    "All LibriVox recordings are in the public domain. "
    "For more information, or to volunteer, please visit librivox dot org."
)
LIBRIVOX_OUTRO = (
    "End of recording. "
    "This recording is in the public domain."
)


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


# LibriVox KJV sources. Chapter ranges come from the archive.org file
# titles, which all follow consistent "Chapter X - Y" formats — verified
# by hand against the metadata API.
#
# Both multi-chapter and per-chapter recordings are included: the alignment
# pass adds intro/outro dummy fragments so aeneas pushes the LibriVox
# boilerplate into those boundary segments (which we then discard).
SOURCES: list[BookSource] = [
    # ── Per-chapter books (one MP3 per chapter) ─────────────────────────
    # OT
    BookSource(
        "josh",
        "bible_kjv_joshua_jc_librivox",
        [SourceFile(f"joshua_{c:02d}_kjv.mp3", c, c) for c in range(1, 25)],
    ),
    BookSource(
        "judg",
        "bible_judges_kjv_jc_librivox",
        [SourceFile(f"judges_{c:02d}_kjv.mp3", c, c) for c in range(1, 22)],
    ),
    BookSource(
        "1sam",
        "bible_1samuel_kjv_0903_librivox",
        [SourceFile(f"1samuel_{c:02d}_kjv.mp3", c, c) for c in range(1, 32)],
    ),
    BookSource(
        "2sam",
        "bible_2samuel_kjv_jc_librivox",
        [SourceFile(f"2samuel_{c:02d}_kjv.mp3", c, c) for c in range(1, 25)],
    ),
    BookSource(
        "1kgs",
        "bible_kjv_11_1king_0909_librivox",
        [SourceFile(f"1kings_{c:02d}_kjv.mp3", c, c) for c in range(1, 23)],
    ),
    BookSource(
        "2kgs",
        "bible_kjv_2kings_jc_librivox",
        [SourceFile(f"2kings_{c:02d}_kjv.mp3", c, c) for c in range(1, 26)],
    ),
    BookSource(
        "1chr",
        "1chronicles_jc_librivox",
        [SourceFile(f"1chronicles_{c:02d}_kjv.mp3", c, c) for c in range(1, 30)],
    ),
    BookSource(
        "prov",
        "proverbs_kjv_mp_librivox",
        [SourceFile(f"proverbs_{c:02d}_kjv.mp3", c, c) for c in range(1, 32)],
    ),
    BookSource(
        "lam",
        "bible_kjv_25_lamentations_mp_0909_librivox",
        [SourceFile(f"lamentations_{c}_kjv.mp3", c, c) for c in range(1, 6)],
    ),
    # NT — per-chapter
    BookSource(
        "matt",
        "matthew_kjv_mp_librivox",
        [SourceFile(f"matthew_{c:02d}_kjv.mp3", c, c) for c in range(1, 29)],
    ),
    BookSource(
        "gal",
        "galatians_kjv_1412_librivox",
        [SourceFile(f"galatians_{c}_kjv.mp3", c, c) for c in range(1, 7)],
    ),
    BookSource(
        "phil",
        "philippians_kjv_vm_librivox",
        [SourceFile(f"philippians_{c}_kjv.mp3", c, c) for c in range(1, 5)],
    ),
    BookSource(
        "phlm",
        "bible_philemon_kjv_1007_librivox",
        [SourceFile("philemon_01_kjv.mp3", 1, 1)],
    ),
    BookSource(
        "rev",
        "bible_kjvnt_27_revelation_1401_librivox",
        [
            SourceFile(
                f"bible_kjvnt_27_revelation_{c:02d}_kingjamesversion(kjv).mp3",
                c,
                c,
            )
            for c in range(1, 23)
        ],
    ),
    BookSource(
        "1john",
        "bible_epistlesjohn_rt_librivox",
        [SourceFile(f"epistlesofjohn_{c}_kjv.mp3", c, c) for c in range(1, 6)],
    ),
    BookSource(
        "2john",
        "bible_epistlesjohn_rt_librivox",
        [SourceFile("epistlesofjohn_6_kjv.mp3", 1, 1)],
    ),
    BookSource(
        "3john",
        "bible_epistlesjohn_rt_librivox",
        [SourceFile("epistlesofjohn_7_kjv.mp3", 1, 1)],
    ),
    # Apocrypha — per-chapter
    BookSource(
        "tob",
        "tobit_kjv_1512_librivox",
        [SourceFile(f"tobit_{c:02d}_kjv.mp3", c, c) for c in range(1, 15)],
    ),
    BookSource(
        "man",
        "prayer_manasseh_ss_librivox",
        [SourceFile("prayerofmanasseh_01_kjv.mp3", 1, 1)],
    ),
    # ── Multi-chapter books (one MP3 spanning several chapters) ─────────
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


def _run_aeneas(mp3: Path, texts: list[str]) -> list[tuple[float, float]]:
    """Low-level aeneas alignment: one fragment per text line."""
    ExecuteTask, Task = _aeneas()
    with tempfile.TemporaryDirectory() as td_str:
        td = Path(td_str)
        text_file = td / "text.txt"
        text_file.write_text(
            "\n".join(re.sub(r"\s+", " ", t).strip() for t in texts) + "\n",
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
        out = [(float(f["begin"]), float(f["end"])) for f in data["fragments"]]
        if len(out) != len(texts):
            raise RuntimeError(
                f"aeneas returned {len(out)} fragments, expected {len(texts)}"
            )
        return out


def _detect_boundary(mp3: Path, region: str) -> float | None:
    """Use ffmpeg silence detection to find the intro end or outro start.

    `region` is "head" (find intro end in first 60 s) or "tail" (find
    outro start in last 60 s).  Returns an absolute timestamp, or None
    if no clear boundary was found.

    Heuristic: the LibriVox intro/outro is separated from the biblical
    text by a noticeable pause.  We look for the first (head) or last
    (tail) merged silence gap >= 0.8 s.
    """
    import subprocess

    if region == "head":
        cmd = ["ffmpeg", "-i", str(mp3), "-t", "60",
               "-af", "silencedetect=noise=-40dB:d=0.25",
               "-f", "null", "-"]
        offset = 0.0
    else:
        # Get duration first.
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(mp3)],
            capture_output=True, text=True, check=True,
        )
        duration = float(probe.stdout.strip())
        offset = max(0.0, duration - 60)
        cmd = ["ffmpeg", "-ss", str(offset), "-i", str(mp3),
               "-af", "silencedetect=noise=-40dB:d=0.25",
               "-f", "null", "-"]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)

    # Parse silence intervals from stderr.
    intervals: list[list[float]] = []
    pending_start: float | None = None
    for line in result.stderr.splitlines():
        m = re.search(r"silence_start:\s*([\d.]+)", line)
        if m:
            pending_start = float(m.group(1))
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m and pending_start is not None:
            intervals.append([pending_start, float(m.group(1))])
            pending_start = None

    # Merge adjacent intervals (gap < 0.3 s).
    merged: list[list[float]] = []
    for iv in intervals:
        if merged and iv[0] - merged[-1][1] < 0.3:
            merged[-1][1] = iv[1]
        else:
            merged.append(list(iv))

    if region == "head":
        # First merged silence >= 0.8 s that starts after 3 s.
        for start, end in merged:
            if start >= 3.0 and (end - start) >= 0.8:
                return end  # intro ends here
    else:
        # Last merged silence >= 0.8 s.
        for start, end in reversed(merged):
            if (end - start) >= 0.8:
                return offset + start  # outro begins here

    return None


def align_file(mp3: Path, chapter_texts: list[str]) -> list[tuple[float, float]]:
    """Run aeneas on a single MP3 with one fragment per chapter.

    Uses aeneas for internal chapter boundaries, and ffmpeg silence
    detection to find intro/outro boundaries (more reliable than DTW
    with dummy text, which drifts on longer files).

    Returns a list of (start_sec, end_sec) tuples in chapter order.
    """
    if len(chapter_texts) == 1:
        # Single chapter: silence detection for both boundaries.
        import subprocess
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(mp3)],
            capture_output=True, text=True, check=True,
        )
        duration = float(probe.stdout.strip())
        intro_end = _detect_boundary(mp3, "head") or 0.0
        outro_start = _detect_boundary(mp3, "tail")
        end = outro_start if outro_start and outro_start > intro_end else duration
        return [(intro_end, end)]

    # Multi-chapter: aeneas for internal boundaries.
    spans = _run_aeneas(mp3, chapter_texts)

    # Override file-level intro/outro with silence detection.
    intro_end = _detect_boundary(mp3, "head")
    if intro_end and intro_end < spans[0][1]:
        spans[0] = (intro_end, spans[0][1])

    outro_start = _detect_boundary(mp3, "tail")
    if outro_start and outro_start > spans[-1][0]:
        spans[-1] = (spans[-1][0], outro_start)

    return spans


def main() -> int:
    force = "--force" in sys.argv
    if not CORPUS_DB.exists():
        print(f"corpus DB not found at {CORPUS_DB}", file=sys.stderr)
        return 1
    con = sqlite3.connect(CORPUS_DB)
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Resume support: load existing JSON so we can re-run after a crash and
    # skip work that's already done. Keyed by `<book>:<chapter>`.
    # --force discards all prior timings to re-align from scratch (needed
    # after changing the alignment strategy, e.g. adding intro/outro
    # boundary fragments).
    existing: dict[str, dict] = {}
    if not force and OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text())
        except Exception:
            existing = {}
    if force:
        print("--force: discarding existing timings, re-aligning everything")

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
