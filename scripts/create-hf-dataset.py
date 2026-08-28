#!/usr/bin/env python3
"""Create the Aletheia corpus dataset on Hugging Face Hub (empty shell + README)."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import DEFAULT_HF_REPO, HF_BRANCH_BY_CHANNEL, die

README = """---
license: cc0-1.0
language:
- en
- he
- grc
tags:
- religion
- bible
- corpus
- sqlite
pretty_name: Aletheia Corpus Packs
---

# Aletheia Corpus Packs

Static, modular corpus artifacts for [Aletheia](https://github.com/Emessjay/Aletheia).

## Channels

| HF branch | Use |
|-----------|-----|
| `development` | In-progress corpus (maintainer uploads) |
| `production` | Stable corpus (promoted on major releases) |

See `data/packs/README.md` in the Aletheia repo for fetch/upload commands.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=DEFAULT_HF_REPO)
    parser.add_argument("--private", action="store_true")
    args = parser.parse_args()

    if not os.environ.get("HF_TOKEN"):
        die("HF_TOKEN is not set")

    try:
        from huggingface_hub import HfApi
    except ImportError:
        die("pip install -r scripts/requirements-corpus.txt")

    api = HfApi()
    repo = args.repo
    api.create_repo(repo_id=repo, repo_type="dataset", private=args.private, exist_ok=True)

    for branch in HF_BRANCH_BY_CHANNEL.values():
        print(f"Ensuring branch {branch!r}…")
        try:
            api.create_branch(repo_id=repo, repo_type="dataset", branch=branch, exist_ok=True)
        except Exception:
            # First commit may create the branch implicitly on upload.
            pass

    info = api.upload_file(
        path_or_fileobj=README.encode("utf-8"),
        path_in_repo="README.md",
        repo_id=repo,
        repo_type="dataset",
        commit_message="Initialize Aletheia corpus dataset",
    )
    revision = getattr(info, "oid", None) or "main"
    print(f"Done — https://huggingface.co/datasets/{repo} ({revision})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
