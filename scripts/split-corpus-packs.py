#!/usr/bin/env python3
"""Split the monolithic Aletheia.sqlite into a lean base + optional pack shards.

Desktop/Tauri only. The web Postgres ingest still reads data/Aletheia.sqlite.

Pack boundaries
---------------
base            verses, books, chapters, strongs, xref, citation, meta,
                verse_fts, plus Summa + Creeds (small always-on patristics).
                Strong's *lexicon* stays in base so English-tagged / future
                lookups keep definitions without the heavy word table.
interlinear     word table (+ indexes) — Hebrew/Greek interlinear columns.
commentaries    work.kind = 'commentary' + sections (+ section_fts for those).
anf             slug LIKE 'anf%'
npnf            slug LIKE 'npnf%'
reformers       luther_/calvin_/knox_/latimer_ prefixes (pipeline group).
audio-modern-en marker JSON + timing manifest; MP3s stay on-demand downloads.

Usage
-----
  python3 scripts/split-corpus-packs.py
  python3 scripts/split-corpus-packs.py --src data/Aletheia.sqlite --out data/packs

Outputs data/packs/{base,interlinear,commentaries,anf,npnf,reformers}.sqlite
plus audio-modern-en/manifest.json and copies kjv-timing.json when present.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path

PACK_VERSION = 1

# Work-slug predicates for section/work packs (applied against work.slug).
WORK_PACKS: dict[str, str] = {
    "commentaries": "kind = 'commentary'",
    "anf": "slug LIKE 'anf%'",
    "npnf": "slug LIKE 'npnf%'",
    "reformers": (
        "slug LIKE 'luther_%' OR slug LIKE 'calvin_%' "
        "OR slug LIKE 'knox_%' OR slug LIKE 'latimer_%'"
    ),
}

# Left in base: summa + creeds* (and anything else not matched above).
BASE_WORK_SQL = """
  kind = 'summa'
  OR slug LIKE 'creeds%'
"""

SECTION_SCHEMA = """
CREATE TABLE work (
    id      INTEGER PRIMARY KEY,
    slug    TEXT NOT NULL UNIQUE,
    title   TEXT NOT NULL,
    author  TEXT NOT NULL,
    kind    TEXT NOT NULL
);
CREATE TABLE section (
    id           INTEGER PRIMARY KEY,
    work_id      INTEGER NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    parent_id    INTEGER REFERENCES section(id) ON DELETE CASCADE,
    ordinal_path TEXT NOT NULL,
    kind         TEXT NOT NULL,
    label        TEXT,
    language     TEXT NOT NULL,
    body         TEXT NOT NULL,
    ordering     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(work_id, ordinal_path, language)
);
CREATE INDEX section_path_idx ON section(work_id, ordinal_path);
CREATE VIRTUAL TABLE section_fts USING fts5(
    body,
    content='section',
    content_rowid='id',
    tokenize="unicode61 remove_diacritics 2"
);
CREATE TRIGGER section_fts_ai AFTER INSERT ON section BEGIN
    INSERT INTO section_fts(rowid, body) VALUES (new.id, new.body);
END;
"""

WORD_SCHEMA = """
CREATE TABLE word (
    id          INTEGER PRIMARY KEY,
    verse_id    INTEGER NOT NULL,
    position    INTEGER NOT NULL,
    surface     TEXT NOT NULL,
    lemma       TEXT,
    strongs     TEXT,
    morphology  TEXT,
    base_text   TEXT,
    english     TEXT,
    UNIQUE(verse_id, position, base_text)
);
CREATE INDEX word_lemma_idx ON word(lemma);
CREATE INDEX word_strongs_idx ON word(strongs);
"""


def human_mb(path: Path) -> str:
    return f"{path.stat().st_size / (1024 * 1024):.1f} MiB"


def connect(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(path))
    con.execute("PRAGMA foreign_keys = OFF")
    con.execute("PRAGMA journal_mode = OFF")
    con.execute("PRAGMA synchronous = OFF")
    return con


def work_ids(src: sqlite3.Connection, where: str) -> list[int]:
    rows = src.execute(f"SELECT id FROM work WHERE {where}").fetchall()
    return [int(r[0]) for r in rows]


def copy_schema_tables(src_path: Path, dest_path: Path) -> None:
    """Clone the full DB then we'll carve it down for base."""
    if dest_path.exists():
        dest_path.unlink()
    shutil.copy2(src_path, dest_path)


def rebuild_section_fts(con: sqlite3.Connection) -> None:
    con.execute("INSERT INTO section_fts(section_fts) VALUES('rebuild')")


def rebuild_verse_fts(con: sqlite3.Connection) -> None:
    con.execute("INSERT INTO verse_fts(verse_fts) VALUES('rebuild')")


def vacuum(path: Path) -> None:
    con = sqlite3.connect(str(path))
    con.execute("VACUUM")
    con.close()


def emit_work_pack(src_path: Path, out_dir: Path, pack_id: str, where: str) -> Path:
    dest = out_dir / f"{pack_id}.sqlite"
    if dest.exists():
        dest.unlink()
    src = connect(src_path)
    ids = work_ids(src, where)
    if not ids:
        print(f"  warning: {pack_id} matched 0 works", file=sys.stderr)

    dst = connect(dest)
    dst.executescript(SECTION_SCHEMA)
    dst.commit()

    src.execute(f"ATTACH DATABASE '{dest}' AS pack")
    # Order: parents before children — copy all works first, then sections.
    # parent_id may reference sections in the same pack; insert with FKs off.
    placeholders = ",".join("?" * len(ids)) if ids else "NULL"
    if ids:
        src.execute(
            f"INSERT INTO pack.work SELECT * FROM work WHERE id IN ({placeholders})",
            ids,
        )
        src.execute(
            f"INSERT INTO pack.section SELECT * FROM section WHERE work_id IN ({placeholders})",
            ids,
        )
    src.commit()
    src.execute("DETACH DATABASE pack")
    src.close()

    dst = connect(dest)
    # Content inserts bypassed the AFTER INSERT trigger (bulk INSERT into
    # attached DB). Rebuild FTS from content table.
    rebuild_section_fts(dst)
    dst.execute(
        "CREATE TABLE IF NOT EXISTS pack_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    dst.execute(
        "INSERT OR REPLACE INTO pack_meta(key, value) VALUES ('pack_id', ?)",
        (pack_id,),
    )
    dst.execute(
        "INSERT OR REPLACE INTO pack_meta(key, value) VALUES ('pack_version', ?)",
        (str(PACK_VERSION),),
    )
    dst.commit()
    dst.close()
    vacuum(dest)
    return dest


def emit_interlinear(src_path: Path, out_dir: Path) -> Path:
    dest = out_dir / "interlinear.sqlite"
    if dest.exists():
        dest.unlink()
    dst = connect(dest)
    dst.executescript(WORD_SCHEMA)
    dst.commit()
    dst.close()

    src = connect(src_path)
    src.execute(f"ATTACH DATABASE '{dest}' AS pack")
    src.execute("INSERT INTO pack.word SELECT * FROM word")
    src.commit()
    src.execute("DETACH DATABASE pack")
    src.close()

    dst = connect(dest)
    dst.execute(
        "CREATE TABLE IF NOT EXISTS pack_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    dst.execute(
        "INSERT OR REPLACE INTO pack_meta(key, value) VALUES ('pack_id', 'interlinear')"
    )
    dst.execute(
        "INSERT OR REPLACE INTO pack_meta(key, value) VALUES ('pack_version', ?)",
        (str(PACK_VERSION),),
    )
    dst.commit()
    dst.close()
    vacuum(dest)
    return dest


def emit_base(src_path: Path, out_dir: Path) -> Path:
    """Start from full copy; strip pack-owned rows; keep summa+creeds."""
    dest = out_dir / "base.sqlite"
    copy_schema_tables(src_path, dest)
    con = connect(dest)

    # Drop all optional work packs from base.
    for where in WORK_PACKS.values():
        ids = work_ids(con, where)
        if not ids:
            continue
        ph = ",".join("?" * len(ids))
        con.execute(f"DELETE FROM section WHERE work_id IN ({ph})", ids)
        con.execute(f"DELETE FROM work WHERE id IN ({ph})", ids)

    # Interlinear is optional.
    con.execute("DELETE FROM word")

    rebuild_section_fts(con)
    # verse_fts unchanged (we didn't delete verses).
    con.execute(
        "CREATE TABLE IF NOT EXISTS pack_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    con.execute(
        "INSERT OR REPLACE INTO pack_meta(key, value) VALUES ('pack_id', 'base')"
    )
    con.execute(
        "INSERT OR REPLACE INTO pack_meta(key, value) VALUES ('pack_version', ?)",
        (str(PACK_VERSION),),
    )
    con.commit()
    con.close()
    vacuum(dest)
    return dest


def emit_audio_pack(repo: Path, out_dir: Path) -> Path:
    audio_dir = out_dir / "audio-modern-en"
    audio_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "id": "audio-modern-en",
        "version": PACK_VERSION,
        "title": "Audio (Modern English)",
        "description": (
            "Enables on-demand Modern English narration (BSB / KJV / WEB). "
            "MP3s are downloaded at play time into app data — this pack is a "
            "feature gate plus timing metadata, not a bulk audio archive."
        ),
        "translations": ["en_bsb", "en_kjv", "en_web"],
    }
    man_path = audio_dir / "manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    timing_src = repo / "data" / "audio" / "kjv-timing.json"
    if timing_src.is_file():
        shutil.copy2(timing_src, audio_dir / "kjv-timing.json")
    return audio_dir


def write_registry(out_dir: Path, artifacts: dict[str, Path]) -> None:
    entries = []
    for pack_id, path in artifacts.items():
        if path.is_dir():
            size = sum(p.stat().st_size for p in path.rglob("*") if p.is_file())
            kind = "directory"
        else:
            size = path.stat().st_size
            kind = "sqlite"
        entries.append(
            {
                "id": pack_id,
                "version": PACK_VERSION,
                "path": str(path.relative_to(out_dir)),
                "kind": kind,
                "bytes": size,
            }
        )
    registry = {
        "version": PACK_VERSION,
        "note": (
            "Tauri test/dev builds bundle all packs. Production installers "
            "should ship only base.sqlite; optional packs download into "
            "app_data/packs/."
        ),
        "packs": entries,
    }
    (out_dir / "registry.json").write_text(
        json.dumps(registry, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        type=Path,
        default=Path("data/Aletheia.sqlite"),
        help="Monolithic corpus SQLite",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/packs"),
        help="Output directory for pack artifacts",
    )
    args = parser.parse_args()
    src: Path = args.src
    out: Path = args.out
    if not src.is_file():
        print(f"error: source corpus not found: {src}", file=sys.stderr)
        return 1

    repo = Path.cwd()
    out.mkdir(parents=True, exist_ok=True)
    print(f"Splitting {src} ({human_mb(src)}) → {out}/")

    artifacts: dict[str, Path] = {}
    print("  base…")
    artifacts["base"] = emit_base(src, out)
    print(f"    {human_mb(artifacts['base'])}")

    print("  interlinear…")
    artifacts["interlinear"] = emit_interlinear(src, out)
    print(f"    {human_mb(artifacts['interlinear'])}")

    for pack_id, where in WORK_PACKS.items():
        print(f"  {pack_id}…")
        artifacts[pack_id] = emit_work_pack(src, out, pack_id, where)
        print(f"    {human_mb(artifacts[pack_id])}")

    print("  audio-modern-en…")
    artifacts["audio-modern-en"] = emit_audio_pack(repo, out)
    size = sum(
        p.stat().st_size for p in artifacts["audio-modern-en"].rglob("*") if p.is_file()
    )
    print(f"    {size / 1024:.1f} KiB")

    write_registry(out, artifacts)
    print("Wrote registry.json")

    # Sanity: base must not contain commentary works or word rows.
    b = connect(artifacts["base"])
    assert b.execute("SELECT COUNT(*) FROM word").fetchone()[0] == 0
    assert (
        b.execute("SELECT COUNT(*) FROM work WHERE kind = 'commentary'").fetchone()[0]
        == 0
    )
    assert b.execute("SELECT COUNT(*) FROM work WHERE slug LIKE 'anf%'").fetchone()[0] == 0
    base_works = b.execute("SELECT COUNT(*) FROM work").fetchone()[0]
    b.close()
    print(f"OK — base has {base_works} works (summa+creeds), 0 words.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
