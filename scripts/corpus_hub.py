#!/usr/bin/env python3
"""Shared helpers for Aletheia corpus pack distribution on Hugging Face Hub.

Two channels:
  production  — stable downloads (homepage build, release installers)
  development — in-progress corpus (dev-instance, reingest bootstrap)

Each channel has a committed manifest under data/packs/:
  hub-manifest.json      (production)
  hub-manifest.dev.json  (development)
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Literal

Channel = Literal["production", "development"]

DEFAULT_HF_REPO = "Emessjay/aletheia-corpus"

CHANNEL_PRODUCTION: Channel = "production"
CHANNEL_DEVELOPMENT: Channel = "development"

# HF git branch each channel uploads to / promotes onto.
HF_BRANCH_BY_CHANNEL: dict[Channel, str] = {
    CHANNEL_PRODUCTION: "production",
    CHANNEL_DEVELOPMENT: "development",
}

ALL_PACK_IDS: tuple[str, ...] = (
    "base",
    "interlinear",
    "commentaries",
    "anf",
    "npnf",
    "reformers",
    "audio-modern-en",
)

SQLITE_PACK_IDS: tuple[str, ...] = (
    "base",
    "interlinear",
    "commentaries",
    "anf",
    "npnf",
    "reformers",
)

# Optional shards merged into a working monolith (base is copied, not merged).
MERGE_PACK_IDS: tuple[str, ...] = (
    "interlinear",
    "commentaries",
    "anf",
    "npnf",
    "reformers",
)

MARKER_PACK_IDS: tuple[str, ...] = ("audio-modern-en",)

SCHEMA_VERSION = 1

MONOLITH_FILENAME = "Aletheia.sqlite"


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def manifest_path_for_channel(channel: Channel, root: Path | None = None) -> Path:
    base = (root or repo_root()) / "data" / "packs"
    if channel == CHANNEL_PRODUCTION:
        return base / "hub-manifest.json"
    return base / "hub-manifest.dev.json"


def hub_manifest_path(root: Path | None = None) -> Path:
    return manifest_path_for_channel(CHANNEL_PRODUCTION, root)


def packs_dir(root: Path | None = None) -> Path:
    return (root or repo_root()) / "data" / "packs"


def monolith_path(root: Path | None = None) -> Path:
    return (root or repo_root()) / "data" / MONOLITH_FILENAME


def parse_channel(raw: str | None, default: Channel = CHANNEL_PRODUCTION) -> Channel:
    if not raw:
        return default
    if raw in (CHANNEL_PRODUCTION, CHANNEL_DEVELOPMENT):
        return raw  # type: ignore[return-value]
    die(f"unknown channel {raw!r} (expected production or development)")


def sha256_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(chunk_size)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def dir_bytes(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def pack_artifact_path(packs: Path, pack_id: str) -> Path:
    if pack_id in MARKER_PACK_IDS:
        return packs / pack_id
    return packs / f"{pack_id}.sqlite"


def pack_remote_path(pack_id: str) -> str:
    if pack_id in MARKER_PACK_IDS:
        return pack_id
    return f"{pack_id}.sqlite"


def pack_kind(pack_id: str) -> str:
    return "directory" if pack_id in MARKER_PACK_IDS else "sqlite"


def describe_pack(packs: Path, pack_id: str) -> dict[str, Any]:
    path = pack_artifact_path(packs, pack_id)
    if not path.exists():
        raise FileNotFoundError(f"pack artifact missing: {path}")
    remote = pack_remote_path(pack_id)
    kind = pack_kind(pack_id)
    if kind == "directory":
        return {
            "id": pack_id,
            "kind": kind,
            "path": remote,
            "bytes": dir_bytes(path),
            "sha256": sha256_directory_manifest(path),
        }
    return {
        "id": pack_id,
        "kind": kind,
        "path": remote,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def sha256_directory_manifest(root: Path) -> str:
    """Stable digest over every file's relative path + sha256 (sorted)."""
    h = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        digest = sha256_file(path)
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(digest.encode("ascii"))
        h.update(b"\n")
    return h.hexdigest()


def verify_pack(packs: Path, entry: dict[str, Any]) -> None:
    pack_id = str(entry["id"])
    path = pack_artifact_path(packs, pack_id)
    if not path.exists():
        raise FileNotFoundError(f"downloaded pack missing: {path}")
    expected = str(entry.get("sha256", ""))
    if not expected:
        raise ValueError(f"hub manifest entry for {pack_id} has no sha256")
    if pack_kind(pack_id) == "directory":
        actual = sha256_directory_manifest(path)
    else:
        actual = sha256_file(path)
    if actual != expected:
        raise ValueError(
            f"checksum mismatch for {pack_id}: expected {expected}, got {actual}"
        )
    expected_bytes = entry.get("bytes")
    if expected_bytes is not None:
        actual_bytes = dir_bytes(path) if path.is_dir() else path.stat().st_size
        if int(expected_bytes) != actual_bytes:
            raise ValueError(
                f"size mismatch for {pack_id}: expected {expected_bytes}, got {actual_bytes}"
            )


def load_hub_manifest(root: Path | None = None) -> dict[str, Any]:
    return load_channel_manifest(CHANNEL_PRODUCTION, root)


def load_channel_manifest(channel: Channel, root: Path | None = None) -> dict[str, Any]:
    path = manifest_path_for_channel(channel, root)
    if not path.is_file():
        raise FileNotFoundError(
            f"hub manifest not found: {path}\n"
            "Run upload-corpus-packs after building packs, or fetch a release branch."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def save_channel_manifest(
    manifest: dict[str, Any],
    channel: Channel,
    root: Path | None = None,
) -> Path:
    path = manifest_path_for_channel(channel, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def save_hub_manifest(manifest: dict[str, Any], root: Path | None = None) -> Path:
    return save_channel_manifest(manifest, CHANNEL_PRODUCTION, root)


def manifest_pack_ids(manifest: dict[str, Any]) -> list[str]:
    packs = manifest.get("packs", [])
    return [str(p["id"]) for p in packs if isinstance(p, dict) and "id" in p]


def hf_branch_for_channel(channel: Channel, manifest: dict[str, Any] | None = None) -> str:
    if manifest and manifest.get("branch"):
        return str(manifest["branch"])
    return HF_BRANCH_BY_CHANNEL[channel]


def resolve_hf_url(repo: str, revision: str, remote_path: str) -> str:
    return f"https://huggingface.co/datasets/{repo}/resolve/{revision}/{remote_path}"


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def repoint_hf_branch(api: Any, repo: str, branch: str, revision: str) -> None:
    """Point a dataset branch at an existing commit (fast promote — no re-upload)."""
    try:
        api.delete_branch(repo_id=repo, repo_type="dataset", branch=branch)
    except Exception:
        pass
    api.create_branch(
        repo_id=repo,
        repo_type="dataset",
        branch=branch,
        revision=revision,
    )


def ensure_hf_branch(
    api: Any,
    repo: str,
    branch: str,
    *,
    start_revision: str = "main",
) -> None:
    """Create branch if missing (needed before first upload_folder to that branch)."""
    api.create_branch(
        repo_id=repo,
        repo_type="dataset",
        branch=branch,
        revision=start_revision,
        exist_ok=True,
    )
