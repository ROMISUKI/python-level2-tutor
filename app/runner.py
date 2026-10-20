"""Run learner code in a separate, time-limited process."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from .paths import data_dir

MAX_OUTPUT = 256 * 1024
DEFAULT_TIMEOUT = 6.0
MAX_TIMEOUT = 15.0


def _reader(stream, sink: list[bytes], counter: list[int]) -> None:
    try:
        while True:
            chunk = stream.read(4096)
            if not chunk:
                break
            if counter[0] < MAX_OUTPUT:
                sink.append(chunk[: MAX_OUTPUT - counter[0]])
                counter[0] += len(chunk)
    except (ValueError, OSError):
        pass
    finally:
        try:
            stream.close()
        except OSError:
            pass


def _minimal_env(workdir: Path) -> dict[str, str]:
    keep = {
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", r"C:\Windows"),
        "WINDIR": os.environ.get("WINDIR", r"C:\Windows"),
        "PATH": os.environ.get("PATH", ""),
        "TEMP": str(workdir),
        "TMP": str(workdir),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONHASHSEED": "0",
    }
    return {k: v for k, v in keep.items() if v}


def _runner_command(script: Path) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--run-user-code", str(script)]
    return [sys.executable, "-I", "-X", "utf8", str(script)]


def run_code(
    code: str,
    stdin_text: str = "",
    timeout: float = DEFAULT_TIMEOUT,
    files: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Execute *code* and capture stdout/stderr. Never raises for user errors."""
    code = code or ""
    if len(code) > 60_000:
        return {
            "ok": False,
            "stdout": "",
            "stderr": "代码过长（上限 60000 字符）。",
            "returncode": -1,
            "durationMs": 0,
            "timedOut": False,
            "truncated": False,
        }
    timeout = max(1.0, min(float(timeout or DEFAULT_TIMEOUT), MAX_TIMEOUT))

    workdir = Path(tempfile.mkdtemp(prefix="pyl2-run-", dir=str(data_dir())))
    script = workdir / "main.py"
    script.write_text(code, encoding="utf-8")
    for name, content in (files or {}).items():
        try:
            target = (workdir / name).resolve()
            target.relative_to(workdir.resolve())
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(str(content), encoding="utf-8")
        except (OSError, ValueError):
            pass
    started = time.perf_counter()
    proc = None
    out_chunks: list[bytes] = []
    err_chunks: list[bytes] = []
    out_count = [0]
    err_count = [0]
    threads: list[threading.Thread] = []
    try:
        proc = subprocess.Popen(
            _runner_command(script),
            cwd=str(workdir),
            env=_minimal_env(workdir),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        for stream, sink, counter in (
            (proc.stdout, out_chunks, out_count),
            (proc.stderr, err_chunks, err_count),
        ):
            thread = threading.Thread(
                target=_reader, args=(stream, sink, counter), daemon=True
            )
            thread.start()
            threads.append(thread)

        def _feed_stdin() -> None:
            try:
                if stdin_text:
                    proc.stdin.write((stdin_text or "").encode("utf-8"))
                proc.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass

        writer = threading.Thread(target=_feed_stdin, daemon=True)
        writer.start()

        timed_out = False
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            _kill_tree(proc.pid)
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
        for thread in threads:
            thread.join(timeout=2)
        writer.join(timeout=1)

        stdout = b"".join(out_chunks).decode("utf-8", errors="replace")
        stderr = b"".join(err_chunks).decode("utf-8", errors="replace")
        if timed_out:
            stderr = (stderr + "\n" if stderr else "") + f"运行超时（超过 {timeout:g} 秒），已终止。"
        truncated = out_count[0] >= MAX_OUTPUT or err_count[0] >= MAX_OUTPUT
        if truncated:
            stderr += "\n输出内容过多，已截断。"
        duration = int((time.perf_counter() - started) * 1000)
        return {
            "ok": (not timed_out) and proc.returncode == 0,
            "stdout": stdout,
            "stderr": stderr,
            "returncode": proc.returncode,
            "durationMs": duration,
            "timedOut": timed_out,
            "truncated": truncated,
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "ok": False,
            "stdout": "",
            "stderr": f"无法启动代码运行环境：{exc}",
            "returncode": -1,
            "durationMs": int((time.perf_counter() - started) * 1000),
            "timedOut": False,
            "truncated": False,
        }
    finally:
        if proc and proc.poll() is None:
            _kill_tree(proc.pid)
        shutil.rmtree(workdir, ignore_errors=True)


def _kill_tree(pid: int) -> None:
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                timeout=5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        else:  # pragma: no cover
            os.kill(pid, 9)
    except Exception:
        pass


def normalize_output(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def _numbers(text: str) -> list[float] | None:
    import re

    parts = re.findall(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", text)
    if not parts:
        return None
    try:
        return [float(p) for p in parts]
    except ValueError:
        return None


def compare_output(expected: str, actual: str, mode: str = "exact") -> bool:
    exp = normalize_output(expected)
    got = normalize_output(actual)
    if exp == got:
        return True
    if mode == "float":
        a, b = _numbers(exp), _numbers(got)
        if a is None or b is None or len(a) != len(b):
            return False
        return all(abs(x - y) <= 1e-6 * max(1.0, abs(x)) for x, y in zip(a, b))
    if mode == "ignore_case":
        return exp.lower() == got.lower()
    return False


def grade(code: str, tests: list[dict[str, Any]], timeout: float = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """Run every test case and report a per-test verdict."""
    results = []
    passed = 0
    total_ms = 0
    for index, test in enumerate(tests, start=1):
        outcome = run_code(
            code,
            test.get("stdin", ""),
            timeout=timeout,
            files=test.get("files"),
        )
        total_ms += outcome["durationMs"]
        expected = test.get("stdout", "")
        ok = outcome["ok"] and compare_output(
            expected, outcome["stdout"], test.get("mode", "exact")
        )
        if ok:
            passed += 1
        results.append(
            {
                "index": index,
                "name": test.get("name") or f"测试点 {index}",
                "passed": ok,
                "stdin": test.get("stdin", ""),
                "expected": expected,
                "actual": outcome["stdout"],
                "stderr": outcome["stderr"],
                "ok": outcome["ok"],
                "timedOut": outcome["timedOut"],
                "durationMs": outcome["durationMs"],
                "hidden": bool(test.get("hidden")),
                "files": list((test.get("files") or {}).keys()),
            }
        )
    return {
        "passed": passed,
        "total": len(tests),
        "allPassed": passed == len(tests),
        "results": results,
        "durationMs": total_ms,
    }
