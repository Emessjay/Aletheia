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


# Whitespace + entity cleanup applied to every body. `&c;` is a non-standard
# convention some modules carry (Wesley uses it for "&c." / "etcetera"); the
# rest is standard HTML entity decoding.
_C_ENT = re.compile(r"&c;")

# pysword's `clean=True` strips most OSIS markup, but commentary modules
# carry inline footnote tags like `<note n="…">…</note>` and bare reference
# anchors that aren't part of pysword's allowlist. We disable pysword's
# cleaner (`clean=False`) so we keep paragraph milestones, then drop the
# notes wholesale (they're translator annotations, not the author's prose,
# and inlining them mid-sentence reads as gibberish) and strip remaining
# bare tags ourselves.
_NOTE_BLOCK = re.compile(r"<note\b[^>]*>.*?</note>", re.DOTALL | re.IGNORECASE)

# OSIS marks paragraph boundaries with empty-element <div sID/eID type="x-p"/>
# milestones. Convert them to a sentinel before the generic tag-strip pass so
# they survive as real paragraph breaks in the output. We use sID
# (paragraph-start) milestones only — eID closes the same paragraph it opens,
# and converting both would inject an extra blank line at every boundary.
_PARA_START = re.compile(
    r"<div\b(?=[^>]*type=[\"']x-p[\"'])(?=[^>]*sID=)[^>]*/>",
    re.IGNORECASE,
)
_LINE_BREAK = re.compile(r"<lb\b[^>]*/?>", re.IGNORECASE)
_PARA_TAG = re.compile(r"<p\b[^>]*>", re.IGNORECASE)

_BARE_TAG = re.compile(r"<[^>]+>")

# After tag stripping, normalize whitespace: collapse horizontal runs, then
# fold any run of newlines into either " " (1 newline → source line wrap)
# or "\n\n" (2+ newlines → real paragraph boundary from the x-p milestones).
_HWS = re.compile(r"[ \t]+")
_NL_RUN = re.compile(r"[ \t]*(?:\r?\n[ \t]*)+")


def _normalize_newlines(text: str) -> str:
    return _NL_RUN.sub(
        lambda m: "\n\n" if m.group(0).count("\n") >= 2 else " ",
        text,
    )


def clean_body(text: str) -> str:
    text = _NOTE_BLOCK.sub("", text)
    # Convert paragraph milestones to sentinels BEFORE wiping bare tags.
    text = _PARA_START.sub("\n\n", text)
    text = _LINE_BREAK.sub("\n\n", text)
    text = _PARA_TAG.sub("\n\n", text)
    text = _BARE_TAG.sub("", text)
    text = _C_ENT.sub("&c.", text)
    text = html.unescape(text)
    text = _HWS.sub(" ", text)
    text = _normalize_newlines(text)
    return text.strip()


def _patch_ztext_for_overlong_verses(reader) -> None:
    """Monkey-patch pysword's ZTextModule to recover verses longer than 64 KiB.

    The `ztext` / `zcom` SWORD index stores each verse's byte length as a u16,
    so any single-verse entry of >= 65,536 bytes wraps around in the on-disk
    length field. Calvin's Genesis 1:1 commentary entry, for example, is
    ~118 KB and pysword reads the wrapped length (52,670 B), truncating the
    body mid-sentence at "They intersperse their writings wi…".

    The buffer also carries each entry's *start* offset as a u32, which does
    NOT wrap. So the true length of a verse can be recovered by looking at
    the next verse's start within the same compressed buffer — and that's
    what this patch does. The original `verse_len` is used only as a safety
    upper bound (`true_len % 65536` should equal the stored u16) so a stale
    or corrupt index never produces a runaway read.
    """
    import struct

    bibles = [reader] if hasattr(reader, "_text_for_index") else []
    if not bibles:
        return

    bible = bibles[0]
    if type(bible).__name__ not in {"ZTextModule", "ZTextModule4"}:
        return

    record_format = bible._verse_record_format
    record_size = bible._verse_record_size

    # Precompute, per testament, the array of (buf_num, verse_start) for every
    # verse-record so we can find "next verse with same buf" in O(1).
    record_table: dict[str, list[tuple[int, int]]] = {}
    for testament_name, testament in bible._testaments.items():
        verse_to_buf = testament.v2b_name
        verse_to_buf.seek(0)
        raw = verse_to_buf.read(testament.v2b_size)
        records: list[tuple[int, int]] = []
        for off in range(0, len(raw), record_size):
            rec = raw[off : off + record_size]
            if len(rec) < record_size:
                break
            buf_num, verse_start, _verse_len = struct.unpack(record_format, rec)
            records.append((buf_num, verse_start))
        record_table[testament_name] = records

    original = bible._text_for_index.__func__

    def patched(self, testament, index):  # type: ignore[no-untyped-def]
        if (record_size * (index + 1)) > self._testaments[testament].v2b_size:
            return ""
        verse_to_buf = self._testaments[testament].v2b_name
        verse_to_buf.seek(record_size * index)
        buf_num, verse_start, stored_len = struct.unpack(
            record_format, verse_to_buf.read(record_size)
        )
        records = record_table[testament]
        # Find the smallest start offset in the same buffer that is strictly
        # greater than ours; that's where the next entry begins. Anything
        # beyond it is the next verse and must not be returned.
        next_start = None
        for nb, ns in records:
            if nb == buf_num and ns > verse_start:
                if next_start is None or ns < next_start:
                    next_start = ns
        decompressed = self._decompressed_text(testament, buf_num)
        if next_start is None:
            end = verse_start + stored_len
        else:
            end = next_start
            # Stored length must be congruent to true length modulo 2^16 if
            # the index is well-formed; if not, fall back to the stored value
            # rather than potentially reading garbage from a future verse.
            true_len = next_start - verse_start
            if true_len % 65536 != stored_len % 65536:
                end = verse_start + stored_len
        return self._decode_bytes(decompressed[verse_start:end])

    bible.__class__._text_for_index = patched


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
    _patch_ztext_for_overlong_verses(reader)

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
                            clean=False,
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
