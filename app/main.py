"""Entry point for Python 二级通关 (local desktop app)."""
from __future__ import annotations

import argparse
import ctypes
import logging
import os
import secrets
import sys
import time
from pathlib import Path

APP_TOKEN = secrets.token_urlsafe(24)


def _setup_logging() -> None:
    from .paths import data_dir

    logging.basicConfig(
        filename=str(data_dir() / "app.log"),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        encoding="utf-8",
    )


def _message(title: str, text: str, error: bool = False) -> None:
    try:
        flags = 0x10 if error else 0x40
        ctypes.windll.user32.MessageBoxW(None, text, title, flags)
    except Exception:
        print(f"{title}: {text}")


def _cleanup_stale_sandboxes() -> None:
    """Remove code-runner temp directories left behind by a killed process."""
    import shutil

    from .paths import data_dir

    cutoff = time.time() - 86400
    for path in data_dir().glob("pyl2-run-*"):
        try:
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            pass


def _run_user_code(argv: list[str]) -> int:
    """Child-process mode used by runner.py when the app is frozen."""
    if len(argv) < 2:
        return 2
    script = Path(argv[1])
    try:
        code = script.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"无法读取代码文件: {exc}", file=sys.stderr)
        return 2
    sys.argv = [str(script)]
    globals_dict = {
        "__name__": "__main__",
        "__file__": str(script),
        "__builtins__": __builtins__,
    }
    try:
        exec(compile(code, str(script), "exec"), globals_dict)
        return 0
    except SystemExit as exc:
        code_value = exc.code
        if isinstance(code_value, int):
            return code_value
        if code_value:
            print(code_value, file=sys.stderr)
        return 0
    except BaseException:
        import traceback

        traceback.print_exc()
        return 1


def _open_window(url: str, title: str, browser: bool) -> None:
    if browser:
        import webbrowser

        webbrowser.open(url)
        print(f"已在浏览器中打开：{url}")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return

    try:
        import webview

        window = webview.create_window(
            title,
            url,
            width=1400,
            height=940,
            min_size=(1080, 720),
            background_color="#F6F7FB",
            text_select=True,
        )
        webview.start(debug=bool(os.environ.get("PYL2_DEBUG")))
        _ = window
    except Exception as exc:  # pragma: no cover - depends on WebView2
        logging.exception("WebView failed: %s", exc)
        import webbrowser

        webbrowser.open(url)
        _message(
            "已切换到浏览器模式",
            "无法创建桌面窗口（可能缺少 Microsoft Edge WebView2 运行时），"
            "已改用默认浏览器打开。\n\n关闭浏览器标签页后，请在命令行按 Ctrl+C 退出。",
        )
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "--run-user-code":
        return _run_user_code([argv[0], *argv[1:]])

    parser = argparse.ArgumentParser(description="Python 二级通关")
    parser.add_argument("--browser", action="store_true", help="在默认浏览器中打开")
    parser.add_argument("--server-only", action="store_true", help="只启动本地服务，不创建窗口")
    parser.add_argument("--port", type=int, default=0, help="本地服务端口（默认自动分配）")
    parser.add_argument("--verbose", action="store_true", help="输出 HTTP 请求日志")
    parser.add_argument("--reset-window", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    _setup_logging()
    _cleanup_stale_sandboxes()
    from .api import Api
    from .content import Content, ContentError
    from .db import Database
    from .paths import APP_TITLE
    from .server import create_server, serve_in_thread

    try:
        content = Content()
    except ContentError as exc:
        logging.exception("Content load failed")
        _message(APP_TITLE, f"题库加载失败：\n{exc}", error=True)
        return 1

    db = Database()
    api = Api(content, db)
    server = create_server(api, verbose=args.verbose, port=args.port)
    serve_in_thread(server)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print(url, flush=True)
    logging.info("Serving %s (content: %s questions, %s exercises)", url, len(content.questions), len(content.exercises))

    if args.server_only:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    else:
        try:
            _open_window(url, APP_TITLE, browser=args.browser)
        finally:
            try:
                server.shutdown()
                server.server_close()
            except Exception:
                pass
            db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
