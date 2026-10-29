"""Build a Linux x86_64/Python 3.11 one-shot migration Lambda ZIP."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="pramana-migration-runner-") as temp:
        root = Path(temp)
        package = root / "package"
        package.mkdir()

        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--target",
                str(package),
                "--implementation",
                "cp",
                "--python-version",
                "3.11",
                "--abi",
                "cp311",
                "--platform",
                "manylinux2014_x86_64",
                "--only-binary=:all:",
                "-r",
                str(BACKEND_DIR / "requirements-migration-runner.txt"),
            ],
            check=True,
        )

        for name in ("app", "migrations"):
            shutil.copytree(
                BACKEND_DIR / name,
                package / name,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".env*"),
            )
        for name in ("alembic.ini", "migration_runner.py"):
            shutil.copy2(BACKEND_DIR / name, package / name)

        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(package.rglob("*")):
                if path.is_file():
                    relative = path.relative_to(package)
                    if relative.name == ".env" or relative.name.startswith(".env."):
                        raise RuntimeError("Refusing to package an environment file")
                    archive.write(path, relative.as_posix())

    size = output.stat().st_size
    if size >= MAX_DIRECT_UPLOAD_BYTES:
        output.unlink(missing_ok=True)
        raise RuntimeError(
            f"ZIP is {size} bytes; Lambda direct upload must stay below "
            f"{MAX_DIRECT_UPLOAD_BYTES} bytes"
        )
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"ZIP: {output}")
    print(f"Size: {size} bytes")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
