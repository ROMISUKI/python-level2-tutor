"""Download the pinned Pyodide runtime used by the mobile code runner."""
from __future__ import annotations

import shutil
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

VERSION = "0.27.7"
FILES = (
    "pyodide.js",
    "pyodide.asm.js",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
)
URLS = (
    f"https://registry.npmmirror.com/pyodide/-/pyodide-{VERSION}.tgz",
    f"https://registry.npmjs.org/pyodide/-/pyodide-{VERSION}.tgz",
)

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "mobile" / "vendor" / "pyodide"


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "python-level2-tutor"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main() -> int:
    TARGET.mkdir(parents=True, exist_ok=True)
    archive = None
    with tempfile.TemporaryDirectory(prefix="pyl2-pyodide-") as temp:
        temp_path = Path(temp) / "pyodide.tgz"
        last_error = None
        for url in URLS:
            for attempt in range(1, 4):
                try:
                    print(f"下载 {url}（第 {attempt} 次）")
                    temp_path.write_bytes(download(url))
                    archive = temp_path
                    break
                except Exception as exc:  # noqa: BLE001
                    last_error = exc
                    print(f"失败：{exc}")
                    time.sleep(3)
            if archive:
                break
        if not archive:
            print(f"无法下载 Pyodide：{last_error}")
            return 1

        with tarfile.open(archive, "r:gz") as tar:
            members = {member.name: member for member in tar.getmembers()}
            for name in FILES:
                member = members.get(f"package/{name}")
                if member is None:
                    print(f"压缩包缺少 {name}")
                    return 1
                source = tar.extractfile(member)
                if source is None:
                    print(f"无法读取 {name}")
                    return 1
                with source, (TARGET / name).open("wb") as output:
                    shutil.copyfileobj(source, output)

    total = sum((TARGET / name).stat().st_size for name in FILES)
    print(f"Pyodide {VERSION} 已准备：{TARGET}（{total / 1024 / 1024:.1f} MB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
