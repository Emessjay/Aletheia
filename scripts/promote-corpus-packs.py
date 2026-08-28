#!/usr/bin/env python3
"""Promote development corpus to production on Hugging Face Hub.

On each major Aletheia release, point the production branch at the pinned
development revision and update data/packs/hub-manifest.json. This is a
branch repoint only — no 8 GB re-upload.

Usage
-----
  export HF_TOKEN=hf_...
  python3 scripts/promote-corpus-packs.py
  python3 scripts/promote-corpus-packs.py --message "Aletheia 0.2.0 corpus"
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import (
    CHANNEL_DEVELOPMENT,
    CHANNEL_PRODUCTION,
    DEFAULT_HF_REPO,
    SCHEMA_VERSION,
    die,
    hf_branch_for_channel,
    load_channel_manifest,
    manifest_pack_ids,
    repoint_hf_branch,
    save_channel_manifest,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=DEFAULT_HF_REPO)
    parser.add_argument("--message", default="", help="Recorded in manifest note only")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dev = load_channel_manifest(CHANNEL_DEVELOPMENT)
    if not dev.get("revision"):
        die("development manifest has no revision — upload to development first")

    repo = str(dev.get("repo") or args.repo)
    dev_revision = str(dev["revision"])
    prod_branch = hf_branch_for_channel(CHANNEL_PRODUCTION)
    pack_ids = manifest_pack_ids(dev)

    print(f"Promoting datasets/{repo}")
    print(f"  development revision {dev_revision}")
    print(f"  → production branch {prod_branch!r}")
    print(f"  packs: {', '.join(pack_ids)}")

    if args.dry_run:
        print("Dry run — no HF API calls.")
        return 0

    if not os.environ.get("HF_TOKEN"):
        die("HF_TOKEN is not set — write token required")

    try:
        from huggingface_hub import HfApi
    except ImportError:
        die("pip install -r scripts/requirements-corpus.txt")

    api = HfApi()
    print(f"Repointing branch {prod_branch!r} to {dev_revision[:12]}…")
    repoint_hf_branch(api, repo, prod_branch, dev_revision)

    # Branch now points at dev_revision; pin that SHA in the production manifest.
    revision = dev_revision
    note = (
        "Production corpus on Hugging Face Hub. "
        "Fetch with: npm run fetch-corpus-packs -- --channel production"
    )
    if args.message:
        note += f" ({args.message})"

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "channel": CHANNEL_PRODUCTION,
        "branch": prod_branch,
        "repo": repo,
        "revision": revision,
        "promotedFrom": dev_revision,
        "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": note,
        "packs": dev.get("packs", []),
    }
    out_path = save_channel_manifest(manifest, CHANNEL_PRODUCTION)
    print(f"Pinned production revision {revision}")
    print(f"Wrote {out_path}")
    print("Commit hub-manifest.json for stable builders to pick up the release.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
