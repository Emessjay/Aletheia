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
audio-modern-en directory pack: manifest + kjv-timing.json + prepackaged
                MP3s (fetch via scripts/fetch-audio-pack.py; not regenerated here).

Usage
-----
  python3 scripts/split-corpus-packs.py
  python3 scripts/split-corpus-packs.py --src data/Aletheia.sqlite --out data/packs
  python3 scripts/split-corpus-packs.py --packs commentaries anf
  python3 scripts/split-corpus-packs.py --packs audio-modern-en   # no SQLite source needed

Outputs data/packs/{base,interlinear,commentaries,anf,npnf,reformers}.sqlite
plus audio-modern-en/manifest.json and copies kjv-timing.json when present.
Existing MP3s under audio-modern-en/ are preserved (fetch separately).

With --packs, only the named shards are rewritten; registry.json is merged
so untouched pack entries keep their prior bytes/paths.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path

PACK_VERSION = 1

# All SQLite/directory pack ids this script can emit (order for full runs).
ALL_PACK_IDS: tuple[str, ...] = (
    "base",
    "interlinear",
    "commentaries",
    "anf",
    "npnf",
    "reformers",
    "audio-modern-en",
)

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
    english     TEXT
);
-- ifnull so NULL base_text (Hebrew TAHOT) participates in uniqueness;
-- table-level UNIQUE(verse_id, position, base_text) treats NULLs as distinct.
CREATE UNIQUE INDEX word_verse_pos_base_idx
    ON word(verse_id, position, ifnull(base_text, ''));
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
    # Keep one row per (verse_id, position, base_text). Hebrew TAHOT rows have
    # NULL base_text; a partial re-ingest historically doubled every position.
    src.execute(
        """
        INSERT INTO pack.word
        SELECT w.id, w.verse_id, w.position, w.surface, w.lemma, w.strongs,
               w.morphology, w.base_text, w.english
          FROM word w
          JOIN (
            SELECT verse_id, position, ifnull(base_text, '') AS bt, MIN(id) AS id
              FROM word
             GROUP BY verse_id, position, ifnull(base_text, '')
          ) keep ON keep.id = w.id
        """
    )
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

    timing_src = repo / "data" / "audio" / "kjv-timing.json"
    if timing_src.is_file():
        shutil.copy2(timing_src, audio_dir / "kjv-timing.json")

    mp3s = [p for p in audio_dir.rglob("*.mp3") if p.is_file() and p.stat().st_size > 0]
    mp3_bytes = sum(p.stat().st_size for p in mp3s)
    if mp3s:
        description = (
            "Prepackaged Modern English narration (BSB + WEB deuterocanon "
            "under en_bsb/, KJV under en_kjv/). Local MP3s play offline; "
            "missing files can still download on demand."
        )
    else:
        description = (
            "Modern English narration pack (BSB / KJV / WEB). Run "
            "`python3 scripts/fetch-audio-pack.py` to download MP3s into this "
            "directory before a full desktop test build."
        )

    manifest = {
        "id": "audio-modern-en",
        "version": PACK_VERSION,
        "title": "Audio (Modern English)",
        "description": description,
        "translations": ["en_bsb", "en_kjv", "en_web"],
        "mp3FileCount": len(mp3s),
        "mp3Bytes": mp3_bytes,
    }
    man_path = audio_dir / "manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return audio_dir


def pack_entry(out_dir: Path, pack_id: str, path: Path) -> dict:
    if path.is_dir():
        size = sum(p.stat().st_size for p in path.rglob("*") if p.is_file())
        kind = "directory"
    else:
        size = path.stat().st_size
        kind = "sqlite"
    return {
        "id": pack_id,
        "version": PACK_VERSION,
        "path": str(path.relative_to(out_dir)),
        "kind": kind,
        "bytes": size,
    }


def write_registry(
    out_dir: Path,
    artifacts: dict[str, Path],
    *,
    merge: bool,
) -> None:
    """Write registry.json. When merge=True, keep entries for packs we did not emit."""
    by_id: dict[str, dict] = {}
    if merge:
        existing = out_dir / "registry.json"
        if existing.is_file():
            try:
                prev = json.loads(existing.read_text(encoding="utf-8"))
                for entry in prev.get("packs", []):
                    if isinstance(entry, dict) and "id" in entry:
                        by_id[str(entry["id"])] = entry
            except (json.JSONDecodeError, OSError) as e:
                print(f"  warning: could not merge registry.json ({e})", file=sys.stderr)

    for pack_id, path in artifacts.items():
        by_id[pack_id] = pack_entry(out_dir, pack_id, path)

    # Prefer canonical order; append any unknown leftover ids at the end.
    ordered_ids = [pid for pid in ALL_PACK_IDS if pid in by_id]
    ordered_ids.extend(sorted(pid for pid in by_id if pid not in ALL_PACK_IDS))
    entries = [by_id[pid] for pid in ordered_ids]

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


def parse_pack_ids(raw: list[str] | None) -> list[str] | None:
    """None = emit all packs. Otherwise a de-duplicated list in ALL_PACK_IDS order."""
    if not raw:
        return None
    wanted: set[str] = set()
    for token in raw:
        for part in token.split(","):
            part = part.strip()
            if not part:
                continue
            if part not in ALL_PACK_IDS:
                known = ", ".join(ALL_PACK_IDS)
                raise SystemExit(f"error: unknown pack id {part!r} (known: {known})")
            wanted.add(part)
    return [pid for pid in ALL_PACK_IDS if pid in wanted]


def needs_sqlite_source(pack_ids: list[str] | None) -> bool:
    if pack_ids is None:
        return True
    return any(pid != "audio-modern-en" for pid in pack_ids)


def emit_selected(
    src: Path | None,
    out: Path,
    repo: Path,
    pack_ids: list[str] | None,
) -> dict[str, Path]:
    """Emit packs. pack_ids=None means full split."""
    selected = list(ALL_PACK_IDS) if pack_ids is None else pack_ids
    artifacts: dict[str, Path] = {}

    for pack_id in selected:
        print(f"  {pack_id}…")
        if pack_id == "base":
            assert src is not None
            artifacts["base"] = emit_base(src, out)
            print(f"    {human_mb(artifacts['base'])}")
        elif pack_id == "interlinear":
            assert src is not None
            artifacts["interlinear"] = emit_interlinear(src, out)
            print(f"    {human_mb(artifacts['interlinear'])}")
        elif pack_id in WORK_PACKS:
            assert src is not None
            artifacts[pack_id] = emit_work_pack(src, out, pack_id, WORK_PACKS[pack_id])
            print(f"    {human_mb(artifacts[pack_id])}")
        elif pack_id == "audio-modern-en":
            artifacts["audio-modern-en"] = emit_audio_pack(repo, out)
            size = sum(
                p.stat().st_size
                for p in artifacts["audio-modern-en"].rglob("*")
                if p.is_file()
            )
            mp3_n = sum(
                1
                for p in artifacts["audio-modern-en"].rglob("*.mp3")
                if p.is_file() and p.stat().st_size > 0
            )
            if size >= 1024 * 1024:
                print(f"    {size / (1024 * 1024):.1f} MiB ({mp3_n} MP3s)")
            else:
                print(f"    {size / 1024:.1f} KiB ({mp3_n} MP3s — run fetch-audio-pack.py)")
        else:
            raise SystemExit(f"error: unhandled pack id {pack_id!r}")

    return artifacts


def sanity_check_base(base_path: Path) -> None:
    b = connect(base_path)
    assert b.execute("SELECT COUNT(*) FROM word").fetchone()[0] == 0
    assert (
        b.execute("SELECT COUNT(*) FROM work WHERE kind = 'commentary'").fetchone()[0]
        == 0
    )
    assert b.execute("SELECT COUNT(*) FROM work WHERE slug LIKE 'anf%'").fetchone()[0] == 0
    base_works = b.execute("SELECT COUNT(*) FROM work").fetchone()[0]
    b.close()
    print(f"OK — base has {base_works} works (summa+creeds), 0 words.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--src",
        type=Path,
        default=Path("data/Aletheia.sqlite"),
        help="Monolithic corpus SQLite (not required for --packs audio-modern-en alone)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/packs"),
        help="Output directory for pack artifacts",
    )
    parser.add_argument(
        "--packs",
        nargs="+",
        metavar="PACK",
        help=(
            "Emit only these packs (space- or comma-separated). "
            f"Known: {', '.join(ALL_PACK_IDS)}. Default: all."
        ),
    )
    args = parser.parse_args()
    src: Path = args.src
    out: Path = args.out
    try:
        pack_ids = parse_pack_ids(args.packs)
    except SystemExit:
        raise
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if needs_sqlite_source(pack_ids) and not src.is_file():
        print(f"error: source corpus not found: {src}", file=sys.stderr)
        return 1

    repo = Path.cwd()
    out.mkdir(parents=True, exist_ok=True)
    if needs_sqlite_source(pack_ids):
        print(f"Splitting {src} ({human_mb(src)}) → {out}/")
    else:
        print(f"Updating audio pack under {out}/")
    if pack_ids is not None:
        print(f"  (selective: {', '.join(pack_ids)})")

    artifacts = emit_selected(
        src if needs_sqlite_source(pack_ids) else None,
        out,
        repo,
        pack_ids,
    )
    write_registry(out, artifacts, merge=pack_ids is not None)
    print("Wrote registry.json")

    if "base" in artifacts:
        sanity_check_base(artifacts["base"])
    elif pack_ids is not None:
        print(f"OK — updated {len(artifacts)} pack(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
