"""Assemble the installable mobile PWA into mobile-dist/."""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / "mobile"
CONTENT = ROOT / "content"
DIST = ROOT / "mobile-dist"


def main() -> int:
    if not (MOBILE / "index.html").exists():
        print("mobile/ 不存在")
        return 1
    if not (MOBILE / "vendor" / "pyodide" / "pyodide.js").exists():
        print("缺少 mobile/vendor/pyodide，请先运行 tools/fetch_pyodide.py")
        return 1

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    shutil.copytree(
        MOBILE,
        DIST,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("pyodide"),
    )

    shutil.copytree(CONTENT, DIST / "content", dirs_exist_ok=False)
    shutil.copytree(MOBILE / "vendor" / "pyodide", DIST / "pyodide", dirs_exist_ok=False)

    index = {
        "meta": "meta.json",
        "cheatsheet": "cheatsheet.json",
        "chapters": [f"chapters/{p.name}" for p in sorted((CONTENT / "chapters").glob("*.json"))],
        "questions": [f"questions/{p.name}" for p in sorted((CONTENT / "questions").glob("*.json"))],
        "exercises": [f"exercises/{p.name}" for p in sorted((CONTENT / "exercises").glob("*.json"))],
    }
    (DIST / "content" / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    sw = DIST / "sw.js"
    sw.write_text(sw.read_text(encoding="utf-8").replace("__SW_VERSION__", stamp), encoding="utf-8")

    total = sum(p.stat().st_size for p in DIST.rglob("*") if p.is_file())
    print(f"mobile-dist ready: {DIST}")
    print(f"files: {sum(1 for p in DIST.rglob('*') if p.is_file())}, size: {total / 1024 / 1024:.1f} MB")
    print(f"sw version: {stamp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
