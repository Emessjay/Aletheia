#!/usr/bin/env python3
"""Download pinned Aletheia corpus packs from Hugging Face Hub.

Usage
-----
  python3 scripts/fetch-corpus-packs.py
  python3 scripts/fetch-corpus-packs.py --channel development
  python3 scripts/fetch-corpus-packs.py --channel production --packs base interlinear
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import (
    ALL_PACK_IDS,
    CHANNEL_DEVELOPMENT,
    CHANNEL_PRODUCTION,
    MARKER_PACK_IDS,
    SCHEMA_VERSION,
    die,
    load_channel_manifest,
    manifest_pack_ids,
    manifest_path_for_channel,
    pack_artifact_path,
    pack_remote_path,
    packs_dir,
    parse_channel,
    verify_pack,
)


def parse_pack_ids(raw: list[str] | None, manifest: dict) -> list[str]:
    known = set(manifest_pack_ids(manifest))
    if not raw:
        return [pid for pid in ALL_PACK_IDS if pid in known]
    wanted: set[str] = set()
    for token in raw:
        for part in token.split(","):
            part = part.strip()
            if part:
                wanted.add(part)
    ordered = [pid for pid in ALL_PACK_IDS if pid in wanted]
    unknown = wanted - set(ordered)
    if unknown:
        die(f"unknown pack id(s): {', '.join(sorted(unknown))}")
    missing = [pid for pid in ordered if pid not in known]
    if missing:
        die(
            f"pack(s) not listed in hub manifest: {', '.join(missing)} "
            f"(known: {', '.join(sorted(known))})"
        )
    return ordered


def fetch_sqlite(repo: str, revision: str, pack_id: str, dest: Path) -> None:
    from huggingface_hub import hf_hub_download

    remote = pack_remote_path(pack_id)
    print(f"  {pack_id}…")
    cached = hf_hub_download(
        repo_id=repo,
        repo_type="dataset",
        filename=remote,
        revision=revision,
        local_dir=dest.parent,
    )
    got = Path(cached)
    if got.resolve() != dest.resolve():
        dest.parent.mkdir(parents=True, exist_ok=True)
        got.replace(dest)


def fetch_directory(repo: str, revision: str, pack_id: str, dest: Path) -> None:
    from huggingface_hub import snapshot_download

    print(f"  {pack_id}… (directory — may take a while)")
        snapshot_download(
            repo_id=repo,
            repo_type="dataset",
            revision=revision,
            allow_patterns=allow_patterns,
            local_dir=dest.parent,
        )


def fetch_packs(
    *,
    channel: str,
    manifest_path: Path | None = None,
    out: Path | None = None,
    pack_ids: list[str] | None = None,
    revision: str | None = None,
    skip_verify: bool = False,
) -> None:
    ch = parse_channel(channel)
    manifest_file = manifest_path or manifest_path_for_channel(ch)
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    repo = str(manifest.get("repo", ""))
    if not repo:
        die("hub manifest missing repo")

    rev = revision or manifest.get("revision")
    if not rev:
        die(
            f"hub manifest for {ch} has no pinned revision.\n"
            "Run upload-corpus-packs (development) or promote-corpus-packs."
        )
    rev = str(rev)

    by_id = {str(p["id"]): p for p in manifest.get("packs", []) if "id" in p}
    selected = parse_pack_ids(pack_ids, manifest) if pack_ids else parse_pack_ids(None, manifest)
    if not selected:
        die("no packs listed in hub manifest")

    dest_root = out or packs_dir()
    dest_root.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {len(selected)} pack(s) [{ch}] from datasets/{repo}@{rev} → {dest_root}/")

    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        die("pip install -r scripts/requirements-corpus.txt")

    for pack_id in selected:
        entry = by_id[pack_id]
        dest = pack_artifact_path(dest_root, pack_id)
        if pack_id in MARKER_PACK_IDS:
            fetch_directory(repo, rev, pack_id, dest)
        else:
            fetch_sqlite(repo, rev, pack_id, dest)
        if not skip_verify:
            verify_pack(dest_root, entry)
            print("    OK — verified sha256")

    write_local_registry(dest_root, [by_id[pid] for pid in selected])
    print("Wrote registry.json")


def write_local_registry(out: Path, entries: list[dict]) -> None:
    reg_path = out / "registry.json"
    by_id: dict[str, dict] = {}
    if reg_path.is_file():
        try:
            prev = json.loads(reg_path.read_text(encoding="utf-8"))
            for entry in prev.get("packs", []):
                if isinstance(entry, dict) and "id" in entry:
                    by_id[str(entry["id"])] = entry
        except (json.JSONDecodeError, OSError):
            pass

    for entry in entries:
        pack_id = str(entry["id"])
        path = pack_artifact_path(out, pack_id)
        by_id[pack_id] = {
            "id": pack_id,
            "version": SCHEMA_VERSION,
            "path": str(path.relative_to(out)),
            "kind": entry.get("kind", "sqlite"),
            "bytes": entry.get("bytes"),
            "sha256": entry.get("sha256"),
        }

    ordered = [by_id[pid] for pid in ALL_PACK_IDS if pid in by_id]
    reg = {
        "version": SCHEMA_VERSION,
        "note": "Local cache; canonical pins live in hub-manifest*.json.",
        "packs": ordered,
    }
    reg_path.write_text(json.dumps(reg, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--channel",
        choices=[CHANNEL_PRODUCTION, CHANNEL_DEVELOPMENT],
        default=CHANNEL_PRODUCTION,
        help="production = stable; development = in-progress (default: production)",
    )
    parser.add_argument("--manifest", type=Path, help="Override manifest path")
    parser.add_argument("--out", type=Path, default=packs_dir())
    parser.add_argument("--revision", help="Override manifest revision")
    parser.add_argument("--packs", nargs="+", metavar="PACK")
    parser.add_argument("--skip-verify", action="store_true")
    args = parser.parse_args()

    try:
        fetch_packs(
            channel=args.channel,
            manifest_path=args.manifest,
            out=args.out,
            pack_ids=args.packs,
            revision=args.revision,
            skip_verify=args.skip_verify,
        )
    except FileNotFoundError as e:
        die(str(e))
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
