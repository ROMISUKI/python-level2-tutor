"""Normalize Windows backslashes in APK asset entry names to forward slashes."""
from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path


def normalize(path: Path) -> int:
    temp = path.with_suffix(".normalized.apk")
    changed = 0
    with zipfile.ZipFile(path, "r") as source, zipfile.ZipFile(temp, "w", allowZip64=True) as target:
        for info in source.infolist():
            name = info.filename.replace("\\", "/")
            if name != info.filename:
                changed += 1
            data = source.read(info.filename)
            entry = zipfile.ZipInfo(name, date_time=info.date_time)
            entry.compress_type = info.compress_type
            entry.external_attr = info.external_attr
            entry.internal_attr = info.internal_attr
            entry.create_system = info.create_system
            target.writestr(entry, data)
    shutil.move(str(temp), str(path))
    print(f"normalized {changed} asset paths in {path.name}")
    return changed


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: normalize_apk.py <apk>")
        raise SystemExit(2)
    normalize(Path(sys.argv[1]))
