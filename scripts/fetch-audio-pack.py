#!/usr/bin/env python3
"""Download Modern English narration MP3s into data/packs/audio-modern-en/.

Mirrors the URL map in src/domain/audio.ts so packaged filenames match what
the Tauri player resolves at runtime:

  data/packs/audio-modern-en/<translation>/<book_slug>/<filename>.mp3

Coverage (same as the audio-modern-en pack gate):
  en_bsb  — Bob Souer BSB (openbible.com) + WEB deuterocanon fallback
            (stored under en_bsb/, matching the reader download path)
  en_kjv  — LibriVox / Archive.org sources from kjv-timing.json

en_web is not downloaded as a separate tree: WEB deuterocanon is reached via
the en_bsb fallback and lands under en_bsb/<slug>/.

MP3s are gitignored (large). Run once locally before a full desktop test
build; the script is resumable (skips non-empty existing files).

Usage
-----
  python3 scripts/fetch-audio-pack.py
  python3 scripts/fetch-audio-pack.py --dry-run
  python3 scripts/fetch-audio-pack.py --translations en_bsb --jobs 12
  python3 scripts/fetch-audio-pack.py --limit 20   # smoke test
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import unquote

try:
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()

USER_AGENT = "Aletheia/0.1 (https://github.com/Emessjay/aletheia)"
PACK_ID = "audio-modern-en"
PACK_VERSION = 1

# ── BSB / WEB maps (keep in sync with src/domain/audio.ts) ───────────────────

BSB_BOOKS: dict[str, tuple[int, str, int]] = {
    "gen": (1, "Gen", 50),
    "exod": (2, "Exo", 40),
    "lev": (3, "Lev", 27),
    "num": (4, "Num", 36),
    "deut": (5, "Deu", 34),
    "josh": (6, "Jos", 24),
    "judg": (7, "Jdg", 21),
    "ruth": (8, "Rut", 4),
    "1sam": (9, "1Sa", 31),
    "2sam": (10, "2Sa", 24),
    "1kgs": (11, "1Ki", 22),
    "2kgs": (12, "2Ki", 25),
    "1chr": (13, "1Ch", 29),
    "2chr": (14, "2Ch", 36),
    "ezra": (15, "Ezr", 10),
    "neh": (16, "Neh", 13),
    "esth": (17, "Est", 10),
    "job": (18, "Job", 42),
    "ps": (19, "Psa", 150),
    "prov": (20, "Pro", 31),
    "eccl": (21, "Ecc", 12),
    "song": (22, "Sng", 8),
    "isa": (23, "Isa", 66),
    "jer": (24, "Jer", 52),
    "lam": (25, "Lam", 5),
    "ezek": (26, "Ezk", 48),
    "dan": (27, "Dan", 12),
    "hos": (28, "Hos", 14),
    "joel": (29, "Jol", 3),
    "amos": (30, "Amo", 9),
    "obad": (31, "Oba", 1),
    "jonah": (32, "Jon", 4),
    "mic": (33, "Mic", 7),
    "nah": (34, "Nam", 3),
    "hab": (35, "Hab", 3),
    "zeph": (36, "Zep", 3),
    "hag": (37, "Hag", 2),
    "zech": (38, "Zec", 14),
    "mal": (39, "Mal", 4),
    "matt": (40, "Mat", 28),
    "mark": (41, "Mrk", 16),
    "luke": (42, "Luk", 24),
    "john": (43, "Jhn", 21),
    "acts": (44, "Act", 28),
    "rom": (45, "Rom", 16),
    "1cor": (46, "1Co", 16),
    "2cor": (47, "2Co", 13),
    "gal": (48, "Gal", 6),
    "eph": (49, "Eph", 6),
    "phil": (50, "Php", 4),
    "col": (51, "Col", 4),
    "1thes": (52, "1Th", 5),
    "2thes": (53, "2Th", 3),
    "1tim": (54, "1Ti", 6),
    "2tim": (55, "2Ti", 4),
    "titus": (56, "Tts", 3),
    "phlm": (57, "Phm", 1),
    "heb": (58, "Heb", 13),
    "jas": (59, "Jas", 5),
    "1pet": (60, "1Pe", 5),
    "2pet": (61, "2Pe", 3),
    "1john": (62, "1Jn", 5),
    "2john": (63, "2Jn", 1),
    "3john": (64, "3Jn", 1),
    "jude": (65, "Jud", 1),
    "rev": (66, "Rev", 22),
}

WEB_BOOKS: dict[str, tuple[str, str, int]] = {
    "tob": ("041", "TOB", 14),
    "jdt": ("042", "JDT", 16),
    "wis": ("045", "WIS", 19),
    "sir": ("046", "SIR", 51),
    "bar": ("047", "BAR", 6),
    "1mac": ("052", "1MA", 16),
    "2mac": ("053", "2MA", 15),
    "1es": ("054", "1ES", 9),
    "man": ("055", "MAN", 1),
    "3mac": ("057", "3MA", 7),
    "2es": ("058", "2ES", 16),
    "4mac": ("059", "4MA", 18),
}


def basename(url: str) -> str:
    path = url.split("?", 1)[0].split("#", 1)[0]
    last = path.rsplit("/", 1)[-1]
    try:
        return unquote(last)
    except Exception:
        return last


def iter_bsb_items() -> list[tuple[str, str, str, str]]:
    """(translation, book_slug, filename, url) for the en_bsb track."""
    out: list[tuple[str, str, str, str]] = []
    for slug, (num, code, chapters) in BSB_BOOKS.items():
        for ch in range(1, chapters + 1):
            url = (
                f"https://openbible.com/audio/souer/"
                f"BSB_{num:02d}_{code}_{ch:03d}.mp3"
            )
            out.append(("en_bsb", slug, basename(url), url))
    for slug, (num, code, chapters) in WEB_BOOKS.items():
        for ch in range(1, chapters + 1):
            url = (
                f"https://ebible.org/eng-webbe/mp3/"
                f"eng-webbe_{num}_{code}_{ch:02d}.mp3"
            )
            out.append(("en_bsb", slug, basename(url), url))
    out.append(
        (
            "en_bsb",
            "ps151",
            "eng-webbe_056_Psalm151.mp3",
            "https://ebible.org/eng-webbe/mp3/eng-webbe_056_Psalm151.mp3",
        )
    )
    return out


def iter_kjv_items(timing_path: Path) -> list[tuple[str, str, str, str]]:
    timing = json.loads(timing_path.read_text(encoding="utf-8"))
    seen: set[tuple[str, str, str]] = set()
    out: list[tuple[str, str, str, str]] = []
    for key, entry in timing.items():
        slug, _ch = key.split(":", 1)
        url = entry["source_url"]
        fn = basename(url)
        dedupe = ("en_kjv", slug, fn)
        if dedupe in seen:
            continue
        seen.add(dedupe)
        out.append(("en_kjv", slug, fn, url))
    return out


def write_manifest(pack_dir: Path, file_count: int, bytes_total: int) -> None:
    manifest = {
        "id": PACK_ID,
        "version": PACK_VERSION,
        "title": "Audio (Modern English)",
        "description": (
            "Prepackaged Modern English narration (BSB + WEB deuterocanon "
            "fallback under en_bsb/, KJV LibriVox under en_kjv/). Playback "
            "uses local pack files; no network fetch when present."
        ),
        "translations": ["en_bsb", "en_kjv", "en_web"],
        "mp3FileCount": file_count,
        "mp3Bytes": bytes_total,
    }
    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


def refresh_registry(packs_dir: Path) -> None:
    """Update audio-modern-en bytes in registry.json when present."""
    reg_path = packs_dir / "registry.json"
    if not reg_path.is_file():
        return
    audio_dir = packs_dir / PACK_ID
    size = sum(p.stat().st_size for p in audio_dir.rglob("*") if p.is_file())
    reg = json.loads(reg_path.read_text(encoding="utf-8"))
    for entry in reg.get("packs", []):
        if entry.get("id") == PACK_ID:
            entry["bytes"] = size
            entry["kind"] = "directory"
            entry["path"] = PACK_ID
    reg_path.write_text(json.dumps(reg, indent=2) + "\n", encoding="utf-8")


def download_one(
    dest: Path,
    url: str,
    timeout: float,
    retries: int,
) -> tuple[str, int, str | None]:
    """Returns (status, bytes, error). status: ok|skip|fail."""
    if dest.is_file() and dest.stat().st_size > 0:
        return "skip", dest.stat().st_size, None
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    last_err: str | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
                data = resp.read()
            if not data:
                raise RuntimeError("empty body")
            part.write_bytes(data)
            part.replace(dest)
            return "ok", len(data), None
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, RuntimeError) as e:
            last_err = str(e)
            if part.exists():
                try:
                    part.unlink()
                except OSError:
                    pass
            if attempt < retries:
                time.sleep(min(2 ** attempt, 20))
    return "fail", 0, last_err


def human(n: int) -> str:
    if n >= 1024**3:
        return f"{n / 1024**3:.2f} GiB"
    if n >= 1024**2:
        return f"{n / 1024**2:.1f} MiB"
    return f"{n / 1024:.1f} KiB"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/packs") / PACK_ID,
        help="Pack directory (default: data/packs/audio-modern-en)",
    )
    parser.add_argument(
        "--timing",
        type=Path,
        default=Path("data/audio/kjv-timing.json"),
        help="KJV timing JSON (source of LibriVox URLs)",
    )
    parser.add_argument(
        "--translations",
        default="en_bsb,en_kjv",
        help="Comma-separated subset: en_bsb,en_kjv",
    )
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0, help="Max files (0=all)")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    wanted = {t.strip() for t in args.translations.split(",") if t.strip()}
    items: list[tuple[str, str, str, str]] = []
    if "en_bsb" in wanted:
        items.extend(iter_bsb_items())
    if "en_kjv" in wanted:
        if not args.timing.is_file():
            print(f"error: timing file missing: {args.timing}", file=sys.stderr)
            return 1
        items.extend(iter_kjv_items(args.timing))
    if args.limit > 0:
        items = items[: args.limit]

    pack_dir: Path = args.out
    pack_dir.mkdir(parents=True, exist_ok=True)

    # Ensure timing sidecar is present for the pack (frontend also embeds it;
    # the pack copy is for install/distribution completeness).
    if args.timing.is_file():
        dest_timing = pack_dir / "kjv-timing.json"
        if not dest_timing.exists() or dest_timing.stat().st_size == 0:
            dest_timing.write_bytes(args.timing.read_bytes())

    print(f"{len(items)} files → {pack_dir}/")
    if args.dry_run:
        by_t: dict[str, int] = {}
        for t, *_ in items:
            by_t[t] = by_t.get(t, 0) + 1
        for t, n in sorted(by_t.items()):
            print(f"  {t}: {n}")
        write_manifest(pack_dir, len(items), 0)
        return 0

    lock = threading.Lock()
    done = {"ok": 0, "skip": 0, "fail": 0, "bytes": 0}
    failures: list[str] = []

    def work(item: tuple[str, str, str, str]) -> None:
        translation, book, filename, url = item
        dest = pack_dir / translation / book / filename
        status, nbytes, err = download_one(dest, url, args.timeout, args.retries)
        with lock:
            done[status] = done.get(status, 0) + 1
            if status != "fail":
                done["bytes"] += nbytes
            else:
                failures.append(f"{translation}/{book}/{filename}: {err}")
            finished = done["ok"] + done["skip"] + done["fail"]
            if finished % 25 == 0 or finished == len(items):
                print(
                    f"  [{finished}/{len(items)}] "
                    f"ok={done['ok']} skip={done['skip']} fail={done['fail']} "
                    f"({human(done['bytes'])})",
                    flush=True,
                )

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(work, items))

    # Recount on-disk (authoritative after skips).
    mp3s = [p for p in pack_dir.rglob("*.mp3") if p.is_file() and p.stat().st_size > 0]
    total_bytes = sum(p.stat().st_size for p in mp3s)
    write_manifest(pack_dir, len(mp3s), total_bytes)
    refresh_registry(pack_dir.parent)

    print(
        f"Done — {len(mp3s)} MP3s, {human(total_bytes)} "
        f"(ok={done['ok']} skip={done['skip']} fail={done['fail']})"
    )
    if failures:
        print(f"{len(failures)} failures:", file=sys.stderr)
        for line in failures[:20]:
            print(f"  {line}", file=sys.stderr)
        if len(failures) > 20:
            print(f"  … and {len(failures) - 20} more", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    # Avoid urllib opening too many sockets on some platforms.
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    raise SystemExit(main())
