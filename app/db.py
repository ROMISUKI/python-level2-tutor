"""SQLite persistence for study progress."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .paths import db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT
);
CREATE TABLE IF NOT EXISTS qstate (
    qid TEXT PRIMARY KEY,
    seen INTEGER NOT NULL DEFAULT 0,
    right INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    last_result INTEGER,
    last_seen TEXT,
    next_review TEXT,
    bookmarked INTEGER NOT NULL DEFAULT 0,
    mastered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qid TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'practice',
    choice INTEGER,
    correct INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    context TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_qid ON attempts(qid);
CREATE INDEX IF NOT EXISTS idx_attempts_time ON attempts(created_at);
CREATE TABLE IF NOT EXISTS exstate (
    eid TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    last_code TEXT,
    last_at TEXT,
    solved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    blueprint TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    answers TEXT,
    score REAL,
    detail TEXT,
    duration_sec INTEGER
);
CREATE TABLE IF NOT EXISTS study_days (
    day TEXT PRIMARY KEY,
    seconds INTEGER NOT NULL DEFAULT 0,
    answered INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chapter_progress (
    cid TEXT PRIMARY KEY,
    read_at TEXT,
    read_seconds INTEGER NOT NULL DEFAULT 0,
    last_section INTEGER NOT NULL DEFAULT 0
);
"""

DEFAULT_SETTINGS = {
    "theme": "light",
    "exam_date": "",
    "daily_goal": "20",
    "reduce_motion": "0",
    "nickname": "",
    "onboarded": "0",
}


def now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


class Database:
    """A tiny thread-safe wrapper. The app has a single local user."""

    def __init__(self, path: Path | None = None):
        self.path = Path(path) if path else db_path()
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()
        self._ensure_settings()

    # ---------------------------------------------------------------- settings
    def _ensure_settings(self) -> None:
        with self._lock:
            for key, value in DEFAULT_SETTINGS.items():
                self._conn.execute(
                    "INSERT OR IGNORE INTO settings(k, v) VALUES(?, ?)", (key, value)
                )
            self._conn.commit()

    def get_settings(self) -> dict[str, str]:
        with self._lock:
            rows = self._conn.execute("SELECT k, v FROM settings").fetchall()
        data = dict(DEFAULT_SETTINGS)
        data.update({r["k"]: r["v"] for r in rows})
        return data

    def set_settings(self, patch: dict[str, Any]) -> dict[str, str]:
        with self._lock:
            for key, value in patch.items():
                if key not in DEFAULT_SETTINGS:
                    continue
                self._conn.execute(
                    "INSERT INTO settings(k, v) VALUES(?, ?) "
                    "ON CONFLICT(k) DO UPDATE SET v=excluded.v",
                    (key, str(value)),
                )
            self._conn.commit()
        return self.get_settings()

    # ------------------------------------------------------------------ states
    def qstate(self, qid: str) -> dict[str, Any]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM qstate WHERE qid=?", (qid,)
            ).fetchone()
        if not row:
            return {
                "qid": qid,
                "seen": 0,
                "right": 0,
                "wrong": 0,
                "streak": 0,
                "last_result": None,
                "last_seen": None,
                "next_review": None,
                "bookmarked": 0,
                "mastered": 0,
            }
        return dict(row)

    def record_answer(
        self,
        qid: str,
        choice: int | None,
        correct: bool,
        duration_ms: int,
        context: str = "practice",
        kind: str = "practice",
    ) -> dict[str, Any]:
        stamp = now_iso()
        state = self.qstate(qid)
        seen = state["seen"] + 1
        right = state["right"] + (1 if correct else 0)
        wrong = state["wrong"] + (0 if correct else 1)
        streak = state["streak"] + 1 if correct else 0
        mastered = state["mastered"]
        next_review = state["next_review"]
        if correct:
            if wrong > 0 and streak >= 2:
                mastered = 1
                next_review = None
            elif next_review:
                # Push the next review further out after a successful review.
                next_review = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        else:
            mastered = 0
            intervals = {1: 1, 2: 2, 3: 4}
            days = intervals.get(wrong, 7)
            next_review = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

        with self._lock:
            self._conn.execute(
                """
                INSERT INTO qstate(qid, seen, right, wrong, streak, last_result,
                                   last_seen, next_review, mastered)
                VALUES(?,?,?,?,?,?,?,?,?)
                ON CONFLICT(qid) DO UPDATE SET
                    seen=excluded.seen, right=excluded.right, wrong=excluded.wrong,
                    streak=excluded.streak, last_result=excluded.last_result,
                    last_seen=excluded.last_seen, next_review=excluded.next_review,
                    mastered=excluded.mastered
                """,
                (
                    qid,
                    seen,
                    right,
                    wrong,
                    streak,
                    1 if correct else 0,
                    stamp,
                    next_review,
                    mastered,
                ),
            )
            self._conn.execute(
                "INSERT INTO attempts(qid, kind, choice, correct, duration_ms, created_at, context)"
                " VALUES(?,?,?,?,?,?,?)",
                (qid, kind, choice, 1 if correct else 0, duration_ms, stamp, context),
            )
            self._conn.execute(
                """
                INSERT INTO study_days(day, answered, correct) VALUES(?, 1, ?)
                ON CONFLICT(day) DO UPDATE SET
                    answered=answered+1, correct=correct+excluded.correct
                """,
                (today(), 1 if correct else 0),
            )
            self._conn.commit()
        return self.qstate(qid)

    def set_bookmark(self, qid: str, value: bool) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO qstate(qid, bookmarked) VALUES(?, ?) "
                "ON CONFLICT(qid) DO UPDATE SET bookmarked=excluded.bookmarked",
                (qid, 1 if value else 0),
            )
            self._conn.commit()

    def remove_from_wrongbook(self, qid: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE qstate SET mastered=1 WHERE qid=?", (qid,)
            )
            self._conn.commit()

    def wrongbook(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM qstate WHERE wrong>0 AND mastered=0 ORDER BY next_review"
            ).fetchall()
        return [dict(r) for r in rows]

    def bookmarks(self) -> list[str]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT qid FROM qstate WHERE bookmarked=1"
            ).fetchall()
        return [r["qid"] for r in rows]

    # --------------------------------------------------------------- exercises
    def exercise_state(self, eid: str) -> dict[str, Any]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM exstate WHERE eid=?", (eid,)
            ).fetchone()
        if not row:
            return {
                "eid": eid,
                "attempts": 0,
                "passed": 0,
                "best_score": 0,
                "last_code": "",
                "last_at": None,
                "solved": 0,
            }
        return dict(row)

    def record_exercise(
        self, eid: str, code: str, passed: int, total: int, score: int
    ) -> dict[str, Any]:
        stamp = now_iso()
        state = self.exercise_state(eid)
        solved = 1 if total and passed == total else state["solved"]
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO exstate(eid, attempts, passed, best_score, last_code, last_at, solved)
                VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(eid) DO UPDATE SET
                    attempts=attempts+1, passed=excluded.passed,
                    best_score=MAX(best_score, excluded.best_score),
                    last_code=excluded.last_code, last_at=excluded.last_at,
                    solved=MAX(solved, excluded.solved)
                """,
                (eid, 1, passed, score, code, stamp, solved),
            )
            self._conn.commit()
        return self.exercise_state(eid)

    # ------------------------------------------------------------------- exams
    def create_exam(self, exam_id: str, blueprint: str, answers: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO exams(id, blueprint, started_at, answers) VALUES(?,?,?,?)",
                (exam_id, blueprint, now_iso(), json.dumps(answers, ensure_ascii=False)),
            )
            self._conn.commit()

    def finish_exam(
        self,
        exam_id: str,
        score: float,
        detail: dict,
        duration_sec: int,
    ) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE exams SET finished_at=?, score=?, detail=?, duration_sec=? WHERE id=?",
                (now_iso(), score, json.dumps(detail, ensure_ascii=False), duration_sec, exam_id),
            )
            self._conn.commit()

    def exam(self, exam_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM exams WHERE id=?", (exam_id,)
            ).fetchone()
        if not row:
            return None
        data = dict(row)
        for key in ("answers", "detail"):
            if data.get(key):
                try:
                    data[key] = json.loads(data[key])
                except (json.JSONDecodeError, TypeError):
                    data[key] = None
        return data

    def exams(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, blueprint, started_at, finished_at, score, duration_sec"
                " FROM exams ORDER BY started_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------- stats
    def activity(self, days: int) -> list[dict[str, Any]]:
        start = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM study_days WHERE day>=? ORDER BY day", (start,)
            ).fetchall()
        by_day = {r["day"]: dict(r) for r in rows}
        result = []
        for i in range(days - 1, -1, -1):
            day = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            result.append(
                by_day.get(day, {"day": day, "seconds": 0, "answered": 0, "correct": 0})
            )
        return result

    def add_seconds(self, seconds: int) -> None:
        seconds = max(0, min(int(seconds), 300))
        if not seconds:
            return
        with self._lock:
            self._conn.execute(
                "INSERT INTO study_days(day, seconds) VALUES(?, ?) "
                "ON CONFLICT(day) DO UPDATE SET seconds=seconds+excluded.seconds",
                (today(), seconds),
            )
            self._conn.commit()

    def totals(self) -> dict[str, int]:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS answered, COALESCE(SUM(correct),0) AS correct,"
                " COALESCE(SUM(duration_ms),0) AS duration FROM attempts"
            ).fetchone()
            wrong = self._conn.execute(
                "SELECT COUNT(*) AS n FROM qstate WHERE wrong>0 AND mastered=0"
            ).fetchone()
            solved = self._conn.execute(
                "SELECT COUNT(*) AS n FROM exstate WHERE solved=1"
            ).fetchone()
            exams = self._conn.execute(
                "SELECT COUNT(*) AS n FROM exams WHERE finished_at IS NOT NULL"
            ).fetchone()
            seconds = self._conn.execute(
                "SELECT COALESCE(SUM(seconds),0) AS s FROM study_days"
            ).fetchone()
        return {
            "answered": row["answered"],
            "correct": row["correct"],
            "durationMs": row["duration"],
            "wrong": wrong["n"],
            "exercisesSolved": solved["n"],
            "exams": exams["n"],
            "studySeconds": seconds["s"],
        }

    def streak(self) -> int:
        with self._lock:
            rows = self._conn.execute(
                "SELECT day FROM study_days WHERE answered>0 OR seconds>60 ORDER BY day DESC"
            ).fetchall()
        days = {r["day"] for r in rows}
        if not days:
            return 0
        cursor = datetime.now()
        if cursor.strftime("%Y-%m-%d") not in days:
            cursor -= timedelta(days=1)
        streak = 0
        while cursor.strftime("%Y-%m-%d") in days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    def chapter_progress(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM chapter_progress").fetchall()
        return {r["cid"]: dict(r) for r in rows}

    def mark_chapter(self, cid: str, section: int, seconds: int) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO chapter_progress(cid, read_at, read_seconds, last_section)
                VALUES(?,?,?,?)
                ON CONFLICT(cid) DO UPDATE SET
                    read_at=excluded.read_at,
                    read_seconds=read_seconds+excluded.read_seconds,
                    last_section=MAX(last_section, excluded.last_section)
                """,
                (cid, now_iso(), max(0, min(seconds, 600)), section),
            )
            self._conn.commit()

    # ------------------------------------------------------------------ backup
    def export_json(self) -> dict[str, Any]:
        with self._lock:
            def dump(table: str) -> list[dict]:
                rows = self._conn.execute(f"SELECT * FROM {table}").fetchall()
                return [dict(r) for r in rows]

            return {
                "app": "PythonLevel2Tutor",
                "version": 1,
                "exported_at": now_iso(),
                "settings": self.get_settings(),
                "qstate": dump("qstate"),
                "attempts": dump("attempts"),
                "exstate": dump("exstate"),
                "exams": dump("exams"),
                "study_days": dump("study_days"),
                "chapter_progress": dump("chapter_progress"),
            }

    def import_json(self, payload: dict[str, Any]) -> None:
        if payload.get("app") != "PythonLevel2Tutor":
            raise ValueError("不是本程序导出的备份文件")
        with self._lock:
            for table in (
                "qstate",
                "attempts",
                "exstate",
                "exams",
                "study_days",
                "chapter_progress",
            ):
                self._conn.execute(f"DELETE FROM {table}")
                for row in payload.get(table) or []:
                    keys = list(row.keys())
                    placeholders = ",".join("?" for _ in keys)
                    self._conn.execute(
                        f"INSERT OR REPLACE INTO {table}({','.join(keys)}) VALUES({placeholders})",
                        [row[k] for k in keys],
                    )
            self._conn.commit()
        if payload.get("settings"):
            self.set_settings(payload["settings"])

    def reset_progress(self) -> None:
        with self._lock:
            for table in (
                "qstate",
                "attempts",
                "exstate",
                "exams",
                "study_days",
                "chapter_progress",
            ):
                self._conn.execute(f"DELETE FROM {table}")
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
