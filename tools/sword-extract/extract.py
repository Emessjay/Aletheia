#!/usr/bin/env python3
"""
Extract a SWORD commentary module to a flat JSON file the Swift ingester can read.

SWORD's reference Python binding `pysword` only advertises support for the
Bible module drivers (rawtext, ztext); it refuses to read commentary modules
(rawcom, zcom) even though the on-disk format is byte-for-byte identical to
their Bible counterparts. This script monkey-patches the module's ModDrv
metadata in memory (e.g. rewriting `zcom4` → `ztext4`) before handing it to
pysword's reader. That's a hack, but a safe one — the only difference at
the format level is the conventional meaning of the indexed text, which
this script handles directly: instead of treating the indexed text as a
verse, we treat it as the commentary block for that verse.

Usage:
    extract.py --module-dir <unpacked-sword-dir> \\
               --module-name <ModuleKey> \\
               --out <output.json>

The module-dir must contain `mods.d/<name>.conf` and the corresponding
`modules/comments/...` subtree (i.e. the layout SWORD distributes as a
.zip).

Output is a JSON array of entries:
    [{"book": "Genesis", "chapter": 1, "verse": 1, "body": "..."}, ...]
Empty/whitespace-only entries are dropped.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path


# Whitespace normalization + entity cleanup applied to every body. Decoding
# standard HTML entities catches `&amp;`; the explicit `&c;` substitution
# handles a non-standard old-print convention some SWORD modules carry
# (Wesley uses `&c;` for "&c." / "etcetera"). Whitespace collapse turns runs
# of internal whitespace into single spaces, which mirrors how the source
# texts are punctuated for prose reading.
_C_ENT = re.compile(r"&c;")
_WS = re.compile(r"\s+")


def clean_body(text: str) -> str:
    text = _C_ENT.sub("&c.", text)
    text = html.unescape(text)
    text = _WS.sub(" ", text)
    return text.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--module-dir", required=True, help="Unpacked SWORD module directory.")
    parser.add_argument("--module-name", required=True, help="Module key (e.g. JFB).")
    parser.add_argument("--out", required=True, help="Output JSON path.")
    args = parser.parse_args()

    try:
        from pysword.modules import SwordModules
        from pysword.canons import canons
    except ImportError:
        print("error: pysword is not installed. Run: pip install pysword", file=sys.stderr)
        return 2

    sm = SwordModules(args.module_dir)
    sm.parse_modules()

    if args.module_name not in sm._modules:
        print(f"error: module {args.module_name!r} not found in {args.module_dir!r}", file=sys.stderr)
        print(f"  available: {sorted(sm._modules)}", file=sys.stderr)
        return 2

    conf = sm._modules[args.module_name]
    moddrv = conf.get("moddrv", "").lower()
    # Spoof the driver name so pysword's Bible reader accepts it. zcom4 ≡ ztext4,
    # zcom ≡ ztext, rawcom4 ≡ rawtext4, rawcom ≡ rawtext at the byte level.
    spoof = {"zcom4": "ztext4", "zcom": "ztext", "rawcom4": "rawtext4", "rawcom": "rawtext"}
    if moddrv in spoof:
        conf["moddrv"] = spoof[moddrv]
    elif moddrv not in {"ztext4", "ztext", "rawtext4", "rawtext"}:
        print(f"error: unsupported ModDrv {moddrv!r}", file=sys.stderr)
        return 2

    reader = sm.get_bible_from_module(args.module_name)

    versification = conf.get("versification", "kjv").lower()
    canon = canons.get(versification) or canons["kjv"]

    entries: list[dict] = []
    skipped_books: list[str] = []

    for testament_key in ("ot", "nt"):
        for book_name, abbrev, osis_id, verses_per_chapter in canon[testament_key]:
            book_had_text = False
            for ch_idx, vcount in enumerate(verses_per_chapter):
                chapter = ch_idx + 1
                for verse in range(1, vcount + 1):
                    try:
                        text = reader.get(
                            books=[book_name],
                            chapters=[chapter],
                            verses=[verse],
                        )
                    except Exception:
                        text = ""
                    if not text:
                        continue
                    cleaned = clean_body(text)
                    if not cleaned:
                        continue
                    entries.append({
                        "book": book_name,
                        "osis": osis_id,
                        "chapter": chapter,
                        "verse": verse,
                        "body": cleaned,
                    })
                    book_had_text = True
            if not book_had_text:
                skipped_books.append(book_name)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))

    print(
        f"  wrote {len(entries)} verse comments → {out_path}"
        + (f" ({len(skipped_books)} books with no content)" if skipped_books else ""),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
