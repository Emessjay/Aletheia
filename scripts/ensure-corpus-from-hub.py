#!/usr/bin/env python3
"""Bootstrap local corpus from Hugging Face Hub (packs + monolith).

Used by reingest-packs.sh and ingest_corpus.py when data/Aletheia.sqlite is
missing. Fetches the development channel by default, then merges SQLite packs
into a monolith.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import (
    CHANNEL_DEVELOPMENT,
    CHANNEL_PRODUCTION,
    SQLITE_PACK_IDS,
    die,
    monolith_path,
    pack_artifact_path,
    packs_dir,
    parse_channel,
)
from merge_packs_to_monolith import merge_packs_to_monolith, sanity_check

SCRIPTS = Path(__file__).resolve().parent


def ensure_corpus_from_hub(
    *,
    channel: str = CHANNEL_DEVELOPMENT,
    packs: Path | None = None,
    monolith: Path | None = None,
    fetch_audio: bool = False,
) -> Path:
    ch = parse_channel(channel)
    pack_root = packs or packs_dir()
    mono = monolith or monolith_path()

    need_fetch = not pack_artifact_path(pack_root, "base").is_file()
    if need_fetch:
        pack_list = list(SQLITE_PACK_IDS)
        if fetch_audio:
            pack_list.append("audio-modern-en")
        cmd = [
            sys.executable,
            str(SCRIPTS / "fetch-corpus-packs.py"),
            "--channel",
            ch,
            "--out",
            str(pack_root),
            "--packs",
            *pack_list,
        ]
        subprocess.run(cmd, check=True)

    if not pack_artifact_path(pack_root, "base").is_file():
        die(f"base pack still missing under {pack_root} after fetch")

    if not mono.is_file():
        print(f"Merging packs → {mono}")
        merge_packs_to_monolith(pack_root, mono)
        counts = sanity_check(mono)
        print(
            f"  monolith OK — verse={counts['verse']:,}  word={counts['word']:,}  "
            f"work={counts['work']:,}"
        )
    return mono


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--channel",
        choices=[CHANNEL_PRODUCTION, CHANNEL_DEVELOPMENT],
        default=CHANNEL_DEVELOPMENT,
    )
    parser.add_argument("--packs", type=Path, default=packs_dir())
    parser.add_argument("--monolith", type=Path, default=monolith_path())
    parser.add_argument("--fetch-audio", action="store_true")
    args = parser.parse_args()

    ensure_corpus_from_hub(
        channel=args.channel,
        packs=args.packs,
        monolith=args.monolith,
        fetch_audio=args.fetch_audio,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
