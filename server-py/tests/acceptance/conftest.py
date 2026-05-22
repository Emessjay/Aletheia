import sys
from pathlib import Path

# Make app/ importable as a top-level package when pytest runs from server-py/.
# Corpus-path resolution moved to the top-level tests/conftest.py so it can
# fall back to the main checkout's data file when the worktree's copy is the
# 0-byte placeholder.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
