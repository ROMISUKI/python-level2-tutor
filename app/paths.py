"""Path helpers for source and frozen (PyInstaller) runs."""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "PythonLevel2Tutor"
APP_TITLE = "Python 二级通关"


def resource_dir() -> Path:
    """Directory that contains bundled resources (web/, content/)."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent.parent


def web_dir() -> Path:
    return resource_dir() / "web"


def content_dir() -> Path:
    return resource_dir() / "content"


def data_dir() -> Path:
    """Per-user writable directory (progress database, logs)."""
    override = os.environ.get("PYL2_DATA_DIR")
    if override:
        path = Path(override)
    else:
        base = os.environ.get("APPDATA") or str(Path.home())
        path = Path(base) / APP_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return data_dir() / "progress.db"
