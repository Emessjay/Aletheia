"""Migration applies cleanly to an empty database."""
import os
import subprocess
import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; integration tests require a running Postgres",
)


def test_alembic_upgrade_head_succeeds():
    """alembic upgrade head exits 0 against the configured DATABASE_URL."""
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd="server-py",
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"alembic upgrade head failed: stdout={result.stdout} stderr={result.stderr}"
    )


def test_alembic_upgrade_head_is_idempotent():
    """Running upgrade head twice in a row is a no-op the second time."""
    subprocess.run(["alembic", "upgrade", "head"], cwd="server-py", check=True)
    second = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd="server-py",
        capture_output=True,
        text=True,
    )
    assert second.returncode == 0
