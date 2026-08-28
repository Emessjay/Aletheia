#!/usr/bin/env python3
"""End-to-end smoke test: HF fetch → merge monolith → sanity checks.

Downloads only the base pack by default (~136 MiB) to keep CI fast.
Set CORPUS_HUB_TEST_PACKS=all for a full download (slow).

Usage
-----
  python3 scripts/test-corpus-hub-pipeline.py
  npm run test:corpus-hub
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus_hub import CHANNEL_PRODUCTION, SQLITE_PACK_IDS

_SCRIPTS = Path(__file__).resolve().parent


def _load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, _SCRIPTS / filename)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _fetch_packs(**kwargs):  # type: ignore[no-untyped-def]
    return _load_module("fetch_corpus_packs", "fetch-corpus-packs.py").fetch_packs(**kwargs)


_merge = _load_module("merge_packs_to_monolith", "merge-packs-to-monolith.py")
merge_packs_to_monolith = _merge.merge_packs_to_monolith
sanity_check = _merge.sanity_check


def main() -> int:
    scope = os.environ.get("CORPUS_HUB_TEST_PACKS", "base")
    if scope == "all":
        packs = list(SQLITE_PACK_IDS)
    else:
        packs = [p.strip() for p in scope.split(",") if p.strip()]

    with tempfile.TemporaryDirectory(prefix="aletheia-corpus-test-") as tmp:
        root = Path(tmp)
        pack_dir = root / "packs"
        monolith = root / "Aletheia.sqlite"

        print(f"1. Fetch production packs: {', '.join(packs)}")
        _fetch_packs(
            channel=CHANNEL_PRODUCTION,
            out=pack_dir,
            pack_ids=packs,
        )

        print("2. Merge into monolith")
        merge_packs_to_monolith(pack_dir, monolith)

        print("3. Sanity check row counts")
        counts = sanity_check(monolith)
        assert counts["verse"] > 0, "expected verses in monolith"
        print(
            f"   verse={counts['verse']:,}  word={counts['word']:,}  "
            f"work={counts['work']:,}"
        )

        if "interlinear" in packs:
            assert counts["word"] > 0, "interlinear pack should add word rows"

    print("OK — corpus hub pipeline smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
