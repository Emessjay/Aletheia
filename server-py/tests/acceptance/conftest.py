import os
import sys
from pathlib import Path

# Make app/ importable as a top-level package when pytest runs from server-py/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Default the corpus path to the repo's bundled SQLite if the env var isn't
# set explicitly — keeps the test command portable.
if "ALETHEIA_CORPUS_PATH" not in os.environ:
    repo_root = Path(__file__).resolve().parents[3]
    os.environ["ALETHEIA_CORPUS_PATH"] = str(repo_root / "data" / "Aletheia.sqlite")
