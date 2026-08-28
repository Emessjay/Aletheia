#!/usr/bin/env python3
"""Merge modular corpus packs into a monolithic Aletheia.sqlite.

Mirrors the desktop runtime merge in src-tauri/src/corpus_packs.rs: copy
base.sqlite, then INSERT OR IGNORE optional SQLite shards.
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import (
    MERGE_PACK_IDS,
    die,
    monolith_path,
    pack_artifact_path,
    packs_dir,
)


def merge_sqlite_pack(conn: sqlite3.Connection, pack_path: Path, pack_id: str) -> None:
    pack_sql = str(pack_path.resolve()).replace("'", "''")
    if pack_id == "interlinear":
        sql = f"""
PRAGMA foreign_keys=OFF;
ATTACH DATABASE '{pack_sql}' AS pack;
INSERT OR IGNORE INTO word SELECT * FROM pack.word;
DETACH DATABASE pack;
"""
    else:
        sql = f"""
PRAGMA foreign_keys=OFF;
ATTACH DATABASE '{pack_sql}' AS pack;
INSERT OR IGNORE INTO work SELECT * FROM pack.work;
INSERT OR IGNORE INTO section SELECT * FROM pack.section;
DETACH DATABASE pack;
"""
    conn.executescript(sql)


def merge_packs_to_monolith(
    packs: Path,
    dest: Path,
    *,
    include: tuple[str, ...] | None = None,
) -> None:
    base = pack_artifact_path(packs, "base")
    if not base.is_file():
        die(f"base pack missing: {base}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(base, dest)

    conn = sqlite3.connect(dest)
    try:
        for pack_id in include or MERGE_PACK_IDS:
            pack_path = pack_artifact_path(packs, pack_id)
            if not pack_path.is_file():
                continue
            merge_sqlite_pack(conn, pack_path, pack_id)
        conn.commit()
    finally:
        conn.close()


def sanity_check(db: Path) -> dict[str, int]:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        verses = conn.execute("SELECT COUNT(*) FROM verse").fetchone()[0]
        words = conn.execute("SELECT COUNT(*) FROM word").fetchone()[0]
        works = conn.execute("SELECT COUNT(*) FROM work").fetchone()[0]
        return {"verse": verses, "word": words, "work": works}
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packs", type=Path, default=packs_dir())
    parser.add_argument("--dest", type=Path, default=monolith_path())
    parser.add_argument("--check", action="store_true", help="Print row counts after merge")
    args = parser.parse_args()

    merge_packs_to_monolith(args.packs, args.dest)
    print(f"Wrote {args.dest}")
    if args.check:
        counts = sanity_check(args.dest)
        print(
            f"  verse={counts['verse']:,}  word={counts['word']:,}  work={counts['work']:,}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
