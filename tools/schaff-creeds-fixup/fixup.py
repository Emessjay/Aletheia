#!/usr/bin/env python3
"""Promote individual confessions inside Schaff's Creeds of Christendom Vol. 3
from <div2> elements to <div1> elements, so each becomes its own work-row in
the ingest pipeline instead of being buried inside "Part Second", "Part Third",
"Part Fourth", or the Lutheran-confessions blob misfiled under "Original
Table of Contents".

Without this rewrite, browsing for the Heidelberg Catechism or Belgic
Confession in Aletheia means clicking into "Part Second. The Creeds of the
Evangelical Reformed Churches" and scrolling through its sub-sections, with
no first-class work entry for the individual creed.

Strategy
========

The script operates on the raw ThML source line-by-line (XML structural
edits, not text edits inside content), preserving everything except the
specific <div1>…</div1> wrappers we're flattening. For each "umbrella" div1
(one of four hardcoded titles), we:

  1. Drop the wrapper div1's opening tag, the closing </div1>, and any text
     between them that doesn't belong to a child div2.
  2. Promote each <div2>…</div2> child to <div1>…</div1>, renumbering nested
     div3/div4 elements down by one level (div3 → div2, div4 → div3, etc.).

The rewrite is idempotent: if the file no longer has any of the umbrella
div1s, the second invocation is a no-op.

This is a purpose-built tool for creeds3.xml specifically. It is NOT a
general ThML flattener.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


# The four div1 wrappers in creeds3.xml whose <div2> children are themselves
# the individual confessions we want surfaced. The "Original Table of
# Contents" one is a Schaff/CCEL editorial misfiling — the Lutheran symbols
# (Augsburg, Small Catechism, Formula of Concord, Saxon Visitation Articles)
# live there for historical reasons in the printed edition.
UMBRELLA_TITLES = {
    "Original Table of Contents",
    "Part Second. The Creeds of the Evangelical Reformed Churches.",
    "Part Third. Modern Protestant Creeds.",
    "Part Fourth. Recent Confessional Declarations and Terms of Corporate Church Union.",
}

# Standard ThML nests up to div5. Beyond that we'd lose structure on rename.
MAX_DEPTH = 5


def is_umbrella_div1_open(line: str) -> bool:
    """Detect a <div1 title="…"> line that opens one of the umbrella wrappers."""
    m = re.match(r'<div1\s+[^>]*?title="([^"]+)"', line)
    if m is None:
        return False
    return m.group(1) in UMBRELLA_TITLES


def transform(text: str) -> str:
    out: list[str] = []
    in_umbrella = False
    depth_offset = 0  # how many levels we're shifting div tags inside the umbrella

    lines = text.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()

        if not in_umbrella:
            if is_umbrella_div1_open(stripped):
                in_umbrella = True
                depth_offset = 1  # divN inside this wrapper becomes div(N-1)
                # Drop the umbrella div1 opening tag. We also need to consume
                # any frontmatter content between this <div1> and the first
                # <div2> child — that's the section header / TOC / fac-simile
                # block. We keep it but strip the wrapper. Simplest: just skip
                # the opening line and let the closing </div1> get consumed
                # later. Anything between stays at its original indentation.
                i += 1
                continue
            out.append(line)
            i += 1
            continue

        # Inside an umbrella.
        # If we hit another top-level <div1, the umbrella has ended without
        # an explicit close — bail out of umbrella mode and re-process this
        # line at the outer level.
        if re.match(r'<div1[\s>]', stripped):
            in_umbrella = False
            depth_offset = 0
            continue  # re-process this line at outer level

        # If we hit </div1>, that closes the umbrella.
        if stripped.startswith("</div1>"):
            in_umbrella = False
            depth_offset = 0
            i += 1
            continue

        # Rename divN → div(N-1) for N in 2..MAX_DEPTH.
        # This handles both open tags (<div2 …>) and close tags (</div2>).
        line_out = line
        for n in range(2, MAX_DEPTH + 1):
            new_n = n - depth_offset
            line_out = re.sub(
                rf"(</?)div{n}(\b)",
                rf"\1div{new_n}\2",
                line_out,
            )
        out.append(line_out)
        i += 1

    return "".join(out)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "path",
        type=Path,
        help="Path to creeds3.xml (will be rewritten in place).",
    )
    args = p.parse_args()

    src = args.path.read_text(encoding="utf-8")
    rewritten = transform(src)

    if src == rewritten:
        print(f"{args.path.name}: already flattened (no umbrella div1s found)",
              file=sys.stderr)
        return 0

    args.path.write_text(rewritten, encoding="utf-8")
    delta = len(rewritten) - len(src)
    print(f"{args.path.name}: rewrote {len(src)} → {len(rewritten)} bytes "
          f"(Δ {delta:+d})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
