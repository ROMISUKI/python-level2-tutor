"""Load and index the bundled curriculum / question bank."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .paths import content_dir


class ContentError(RuntimeError):
    pass


class Content:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root else content_dir()
        self.meta: dict[str, Any] = {}
        self.chapters: dict[str, dict[str, Any]] = {}
        self.questions: dict[str, dict[str, Any]] = {}
        self.exercises: dict[str, dict[str, Any]] = {}
        self.cheatsheet: dict[str, Any] = {}
        self._load()

    # ------------------------------------------------------------------ load
    def _load_json(self, path: Path) -> Any:
        try:
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except FileNotFoundError as exc:
            raise ContentError(f"缺少内容文件: {path.name}") from exc
        except json.JSONDecodeError as exc:
            raise ContentError(f"内容文件 JSON 格式错误: {path.name} -> {exc}") from exc

    def _load(self) -> None:
        meta_path = self.root / "meta.json"
        self.meta = self._load_json(meta_path)

        for path in sorted((self.root / "chapters").glob("*.json")):
            chapter = self._load_json(path)
            cid = chapter.get("id")
            if not cid:
                raise ContentError(f"{path.name} 缺少章节 id")
            if cid in self.chapters:
                raise ContentError(f"章节 id 重复: {cid}")
            self.chapters[cid] = chapter

        for path in sorted((self.root / "questions").glob("*.json")):
            payload = self._load_json(path)
            items = payload.get("questions", payload if isinstance(payload, list) else [])
            for question in items:
                qid = question.get("id")
                if not qid:
                    raise ContentError(f"{path.name} 中存在缺少 id 的题目")
                if qid in self.questions:
                    raise ContentError(f"题目 id 重复: {qid}")
                if question.get("chapter") not in self.chapters:
                    raise ContentError(f"题目 {qid} 引用了不存在的章节")
                self.questions[qid] = question

        for path in sorted((self.root / "exercises").glob("*.json")):
            payload = self._load_json(path)
            items = payload.get("exercises", payload if isinstance(payload, list) else [])
            for exercise in items:
                eid = exercise.get("id")
                if not eid:
                    raise ContentError(f"{path.name} 中存在缺少 id 的代码题")
                if eid in self.exercises:
                    raise ContentError(f"代码题 id 重复: {eid}")
                self.exercises[eid] = exercise

        cheat_path = self.root / "cheatsheet.json"
        if cheat_path.exists():
            self.cheatsheet = self._load_json(cheat_path)

        self._validate()

    def _validate(self) -> None:
        for qid, q in self.questions.items():
            options = q.get("options") or []
            if len(options) < 2:
                raise ContentError(f"题目 {qid} 选项不足")
            if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(options):
                raise ContentError(f"题目 {qid} 的 answer 越界")
            if not q.get("explanation"):
                raise ContentError(f"题目 {qid} 缺少解析")
        for eid, e in self.exercises.items():
            if not e.get("tests"):
                raise ContentError(f"代码题 {eid} 缺少测试用例")
            if not e.get("solution"):
                raise ContentError(f"代码题 {eid} 缺少参考答案")

    # ------------------------------------------------------------------ views
    def chapter_summaries(self) -> list[dict[str, Any]]:
        modules = {m["id"]: m for m in self.meta.get("modules", [])}
        result = []
        for chapter in self.chapters.values():
            module = modules.get(chapter.get("module"), {})
            result.append(
                {
                    "id": chapter["id"],
                    "title": chapter["title"],
                    "subtitle": chapter.get("subtitle", ""),
                    "module": chapter.get("module"),
                    "moduleName": module.get("name", ""),
                    "moduleColor": module.get("color", ""),
                    "order": chapter.get("order", 0),
                    "minutes": chapter.get("minutes", 30),
                    "objectives": chapter.get("objectives", []),
                    "keypoints": chapter.get("keypoints", [])[:4],
                    "sections": len(chapter.get("sections", [])),
                    "questionCount": sum(
                        1 for q in self.questions.values() if q["chapter"] == chapter["id"]
                    ),
                }
            )
        result.sort(key=lambda c: c["order"])
        return result

    def chapter(self, cid: str) -> dict[str, Any]:
        chapter = self.chapters.get(cid)
        if not chapter:
            raise KeyError(cid)
        data = dict(chapter)
        data["questions"] = [
            self.public_question(q)
            for q in self.questions.values()
            if q["chapter"] == cid
        ]
        return data

    @staticmethod
    def public_question(q: dict[str, Any]) -> dict[str, Any]:
        """Question payload that is safe to send before the user answers."""
        return {
            "id": q["id"],
            "chapter": q["chapter"],
            "difficulty": q.get("difficulty", 1),
            "stem": q["stem"],
            "options": q["options"],
            "tags": q.get("tags", []),
            "code": q.get("code"),
        }

    def full_question(self, qid: str) -> dict[str, Any]:
        q = self.questions.get(qid)
        if not q:
            raise KeyError(qid)
        data = dict(q)
        data["publicBasic"] = self.is_public_basic(q)
        return data

    def is_public_basic(self, q: dict[str, Any]) -> bool:
        chapter = self.chapters.get(q.get("chapter"), {})
        return chapter.get("module") == "m5"

    def questions_for_chapter(self, cid: str) -> list[dict[str, Any]]:
        return [q for q in self.questions.values() if q["chapter"] == cid]

    def exercise_public(self, e: dict[str, Any], include_solution: bool = False) -> dict[str, Any]:
        data = {
            "id": e["id"],
            "chapter": e.get("chapter"),
            "title": e["title"],
            "difficulty": e.get("difficulty", 1),
            "level": e.get("level", "basic"),
            "points": e.get("points", 15),
            "statement": e["statement"],
            "inputSpec": e.get("inputSpec", ""),
            "outputSpec": e.get("outputSpec", ""),
            "samples": e.get("samples", []),
            "starter": e.get("starter", ""),
            "hints": e.get("hints", []),
            "tags": e.get("tags", []),
            "knowledge": e.get("knowledge", []),
            "testCount": len(e.get("tests", [])),
        }
        if include_solution:
            data["solution"] = e.get("solution", "")
        return data

    def exam_blueprint(self, key: str = "mock") -> dict[str, Any]:
        papers = self.meta.get("papers", {})
        if key not in papers:
            raise KeyError(key)
        return papers[key]
