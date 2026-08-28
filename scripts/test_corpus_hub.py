#!/usr/bin/env python3
"""Unit tests for corpus_hub checksum helpers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from corpus_hub import (
    CHANNEL_DEVELOPMENT,
    CHANNEL_PRODUCTION,
    manifest_path_for_channel,
    sha256_directory_manifest,
    sha256_file,
    verify_pack,
)


class CorpusHubTest(unittest.TestCase):
    def test_manifest_paths(self) -> None:
        self.assertTrue(
            manifest_path_for_channel(CHANNEL_PRODUCTION).name == "hub-manifest.json"
        )
        self.assertTrue(
            manifest_path_for_channel(CHANNEL_DEVELOPMENT).name
            == "hub-manifest.dev.json"
        )

    def test_sha256_file_stable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.txt"
            path.write_text("hello", encoding="utf-8")
            self.assertEqual(sha256_file(path), sha256_file(path))

    def test_directory_manifest_and_verify(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp)
            root = packs / "audio-modern-en"
            root.mkdir()
            (root / "b.txt").write_text("two", encoding="utf-8")
            (root / "a.txt").write_text("one", encoding="utf-8")
            digest = sha256_directory_manifest(root)
            verify_pack(
                packs,
                {
                    "id": "audio-modern-en",
                    "sha256": digest,
                    "bytes": sum(
                        p.stat().st_size for p in root.rglob("*") if p.is_file()
                    ),
                },
            )


if __name__ == "__main__":
    unittest.main()
