#!/usr/bin/env bash
# Regenerate every app icon from src-tauri/icons/source/icon.svg.
#
# Requires `rsvg-convert` (from librsvg) for SVG rasterisation and the Tauri
# CLI (npm-installed) for the platform-specific output sizes.
#
#   brew install librsvg
#
# Usage:
#   ./scripts/generate_icons.sh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
src_svg="$repo_root/src-tauri/icons/source/icon.svg"
master_png="$repo_root/src-tauri/icons/source/icon-1024.png"

if [[ ! -f "$src_svg" ]]; then
  echo "missing $src_svg" >&2
  exit 1
fi
if ! command -v rsvg-convert >/dev/null; then
  echo "rsvg-convert not found. brew install librsvg" >&2
  exit 1
fi

echo "→ Rasterising master SVG to 1024×1024 PNG"
rsvg-convert "$src_svg" -w 1024 -h 1024 -o "$master_png"

echo "→ Running tauri icon to fan out platform sizes"
cd "$repo_root"
npx tauri icon "$master_png"

echo "✓ Icons written to src-tauri/icons/"
