#!/usr/bin/env python3
"""Upload built corpus packs to Hugging Face Hub (development channel).

Maintainers run this after a local reingest/pack-corpus cycle. Uploads to
the development branch and updates data/packs/hub-manifest.dev.json.

Usage
-----
  export HF_TOKEN=hf_...
  python3 scripts/upload-corpus-packs.py
  python3 scripts/upload-corpus-packs.py --packs commentaries interlinear
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import (
    ALL_PACK_IDS,
    CHANNEL_DEVELOPMENT,
    DEFAULT_HF_REPO,
    MARKER_PACK_IDS,
    SCHEMA_VERSION,
    die,
    describe_pack,
    ensure_hf_branch,
    hf_branch_for_channel,
    load_channel_manifest,
    pack_artifact_path,
    pack_remote_path,
    packs_dir,
    parse_channel,
    save_channel_manifest,
)


def parse_pack_ids(raw: list[str] | None) -> list[str]:
    if not raw:
        return list(ALL_PACK_IDS)
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
    return ordered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packs", nargs="+", metavar="PACK")
    parser.add_argument("--src", type=Path, default=packs_dir())
    parser.add_argument("--repo", default=DEFAULT_HF_REPO)
    parser.add_argument(
        "--channel",
        choices=[CHANNEL_DEVELOPMENT],
        default=CHANNEL_DEVELOPMENT,
        help="Upload target channel (only development is writable here)",
    )
    parser.add_argument("--message", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    channel = parse_channel(args.channel, default=CHANNEL_DEVELOPMENT)
    src: Path = args.src
    if not src.is_dir():
        die(f"packs directory not found: {src}")

    selected = parse_pack_ids(args.packs)
    missing = [pid for pid in selected if not pack_artifact_path(src, pid).exists()]
    if missing:
        die(
            f"missing local artifact(s): {', '.join(missing)}\n"
            "Build packs first: npm run reingest:all"
        )

    entries = [describe_pack(src, pid) for pid in selected]
    for entry in entries:
        pack_id = entry["id"]
        size = entry["bytes"]
        digest = entry["sha256"][:16]
        if size >= 1024 * 1024:
            print(f"  {pack_id}: {size / (1024 * 1024):.1f} MiB  sha256={digest}…")
        else:
            print(f"  {pack_id}: {size / 1024:.1f} KiB  sha256={digest}…")

    if args.dry_run:
        print("Dry run — no upload.")
        return 0

    if not os.environ.get("HF_TOKEN"):
        die("HF_TOKEN is not set — write token required")

    try:
        from huggingface_hub import HfApi
    except ImportError:
        die("pip install -r scripts/requirements-corpus.txt")

    api = HfApi()
    repo = args.repo
    api.create_repo(repo_id=repo, repo_type="dataset", exist_ok=True)

    branch = hf_branch_for_channel(channel)
    ensure_hf_branch(api, repo, branch, start_revision="main")

    msg = args.message or f"Aletheia corpus packs [{channel}] ({', '.join(selected)})"
    print(f"Uploading to datasets/{repo} (branch {branch})…")

    allow_patterns: list[str] = []
    for pack_id in selected:
        remote = pack_remote_path(pack_id)
        if pack_id in MARKER_PACK_IDS:
            allow_patterns.append(f"{remote}/**")
        else:
            allow_patterns.append(remote)

    info = api.upload_folder(
        folder_path=str(src),
        repo_id=repo,
        repo_type="dataset",
        revision=branch,
        allow_patterns=allow_patterns,
        commit_message=msg,
    )

    revision = getattr(info, "oid", None) or getattr(info, "commit_oid", None)
    if not revision:
        revision = api.list_repo_commits(
            repo_id=repo, repo_type="dataset", revision=branch
        )[0].commit_id

    prior: dict[str, dict] = {}
    try:
        old = load_channel_manifest(channel)
        for entry in old.get("packs", []):
            if isinstance(entry, dict) and "id" in entry:
                prior[str(entry["id"])] = entry
    except FileNotFoundError:
        pass

    for entry in entries:
        prior[str(entry["id"])] = entry

    ordered = [prior[pid] for pid in ALL_PACK_IDS if pid in prior]
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "channel": channel,
        "branch": branch,
        "repo": repo,
        "revision": revision,
        "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": (
            "Development corpus on Hugging Face Hub. "
            "Promote to production on major releases: npm run promote-corpus-packs"
        ),
        "packs": ordered,
    }
    out_path = save_channel_manifest(manifest, channel)
    print(f"Pinned development revision {revision}")
    print(f"Wrote {out_path}")
    print("Commit hub-manifest.dev.json after verifying locally.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
