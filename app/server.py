"""Local HTTP server: static web UI + JSON API."""
from __future__ import annotations

import json
import mimetypes
import posixpath
import re
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from .api import Api, ApiError
from .paths import web_dir

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("font/woff2", ".woff2")


class Handler(BaseHTTPRequestHandler):
    server_version = "PyL2/1.0"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------- utilities
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)

    def _send(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, data: Any, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _error(self, message: str, status: int = 400) -> None:
        self._json({"error": message}, status)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > 5 * 1024 * 1024:
            raise ApiError("请求内容过大", 413)
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError("请求 JSON 格式错误")
        if not isinstance(data, dict):
            raise ApiError("请求格式错误")
        return data

    def _check_token(self) -> bool:
        from .main import APP_TOKEN  # late import to avoid a cycle

        token = self.headers.get("X-App-Token") or ""
        if token != APP_TOKEN:
            self._send(403, b'{"error":"forbidden"}', "application/json; charset=utf-8")
            return False
        return True

    # ---------------------------------------------------------------- methods
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path.startswith("/api/"):
            if not self._check_token():
                return
            self._handle_api("GET", path, {})
            return
        self._serve_static(path)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if not path.startswith("/api/"):
            self._error("Not found", 404)
            return
        if not self._check_token():
            return
        try:
            payload = self._read_json()
        except ApiError as exc:
            self._error(exc.message, exc.status)
            return
        self._handle_api("POST", path, payload)

    # ------------------------------------------------------------------- api
    def _handle_api(self, method: str, path: str, payload: dict[str, Any]) -> None:
        api: Api = self.server.api  # type: ignore[attr-defined]
        try:
            if path == "/api/bootstrap" and method == "GET":
                self._json(api.bootstrap())
            elif path == "/api/stats" and method == "GET":
                self._json(api.stats())
            elif path == "/api/chapters" and method == "GET":
                self._json({"items": api._chapters_with_progress()})
            elif path == "/api/questions" and method == "GET":
                from urllib.parse import parse_qs

                query = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
                self._json(api.list_questions(query))
            elif path == "/api/answer" and method == "POST":
                self._json(api.answer(payload))
            elif path == "/api/run" and method == "POST":
                self._json(api.run_snippet(payload))
            elif path == "/api/bookmark" and method == "POST":
                self._json(
                    api.toggle_bookmark(str(payload.get("qid")), bool(payload.get("value")))
                )
            elif path == "/api/wrongbook" and method == "GET":
                self._json(api.wrongbook())
            elif path == "/api/wrongbook/remove" and method == "POST":
                self._json(api.remove_wrong(str(payload.get("qid"))))
            elif path == "/api/bookmarks" and method == "GET":
                self._json(api.bookmarks())
            elif path == "/api/exercises" and method == "GET":
                self._json(api.exercises())
            elif path == "/api/cheatsheet" and method == "GET":
                self._json(api.cheatsheet())
            elif path == "/api/settings" and method == "POST":
                self._json({"settings": api.update_settings(payload)})
            elif path == "/api/heartbeat" and method == "POST":
                self._json(api.heartbeat(payload))
            elif path == "/api/reset" and method == "POST":
                self._json(api.reset())
            elif path == "/api/export" and method == "GET":
                self._json(api.export_data())
            elif path == "/api/import" and method == "POST":
                self._json(api.import_data(payload))
            elif path == "/api/exam/start" and method == "POST":
                self._json(api.start_exam(payload))
            elif path == "/api/exam/submit" and method == "POST":
                self._json(api.submit_exam(payload))
            else:
                match = re.fullmatch(r"/api/chapter/([\w-]+)", path)
                if match and method == "GET":
                    self._json(api.chapter(match.group(1)))
                    return
                match = re.fullmatch(r"/api/chapter/([\w-]+)/progress", path)
                if match and method == "POST":
                    self._json(api.mark_chapter(match.group(1), payload))
                    return
                match = re.fullmatch(r"/api/exercise/([\w-]+)", path)
                if match and method == "GET":
                    self._json(api.exercise(match.group(1)))
                    return
                match = re.fullmatch(r"/api/exercise/([\w-]+)/run", path)
                if match and method == "POST":
                    self._json(api.run_exercise(match.group(1), payload))
                    return
                match = re.fullmatch(r"/api/exercise/([\w-]+)/solution", path)
                if match and method == "GET":
                    self._json(api.reveal_solution(match.group(1)))
                    return
                match = re.fullmatch(r"/api/exam/([\w-]+)", path)
                if match and method == "GET":
                    self._json(api.exam_result(match.group(1)))
                    return
                self._error("接口不存在", 404)
        except ApiError as exc:
            self._error(exc.message, exc.status)
        except KeyError:
            self._error("内容不存在", 404)
        except Exception as exc:  # pragma: no cover - defensive
            import traceback

            traceback.print_exc()
            self._error(f"服务器内部错误：{exc}", 500)

    # --------------------------------------------------------------- static
    def _serve_static(self, path: str) -> None:
        if path in ("/", "/index.html"):
            index = web_dir() / "index.html"
            try:
                html = index.read_text(encoding="utf-8")
            except OSError:
                self._error("界面文件缺失", 500)
                return
            from .main import APP_TOKEN

            html = html.replace("__TOKEN__", APP_TOKEN)
            self._send(
                200,
                html.encode("utf-8"),
                "text/html; charset=utf-8",
            )
            return

        relative = posixpath.normpath(path).lstrip("/")
        if relative.startswith("..") or "\\" in relative:
            self._error("Not found", 404)
            return
        target = (web_dir() / relative).resolve()
        try:
            target.relative_to(web_dir().resolve())
        except ValueError:
            self._error("Not found", 404)
            return
        if not target.is_file():
            self._error("Not found", 404)
            return
        content_type, _ = mimetypes.guess_type(str(target))
        body = target.read_bytes()
        self._send(
            200,
            body,
            (content_type or "application/octet-stream") + (
                "; charset=utf-8" if (content_type or "").startswith(("text/", "application/javascript", "application/json")) else ""
            ),
        )


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr: tuple[str, int], api: Api, verbose: bool = False):
        super().__init__(addr, Handler)
        self.api = api
        self.verbose = verbose

    def handle_error(self, request, client_address) -> None:  # noqa: ANN001
        import sys

        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def create_server(api: Api, verbose: bool = False, port: int = 0) -> LocalServer:
    return LocalServer(("127.0.0.1", port), api, verbose=verbose)


def serve_in_thread(server: LocalServer) -> threading.Thread:
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="pyl2-http")
    thread.start()
    return thread
