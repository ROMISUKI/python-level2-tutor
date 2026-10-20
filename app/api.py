"""Application logic exposed through the local HTTP API."""
from __future__ import annotations

import random
import secrets
import time
from datetime import datetime
from typing import Any

from .content import Content
from .db import Database, today
from .runner import grade, run_code


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


class Api:
    def __init__(self, content: Content, db: Database):
        self.content = content
        self.db = db
        self.started = time.time()

    # ------------------------------------------------------------- bootstrap
    def bootstrap(self) -> dict[str, Any]:
        chapters = self._chapters_with_progress()
        stats = self.stats()
        settings = self.db.get_settings()
        papers = [
            {
                "key": key,
                "title": paper.get("title", key),
                "duration": paper.get("duration", 120),
                "description": paper.get("description", ""),
                "choiceCount": sum(paper.get("counts", {}).values()),
                "codingLevels": paper.get("codingLevels", []),
            }
            for key, paper in self.content.meta.get("papers", {}).items()
        ]
        return {
            "app": {
                "title": self.content.meta.get("title", "Python 二级通关"),
                "subtitle": self.content.meta.get("subtitle", ""),
                "examInfo": self.content.meta.get("examInfo", {}),
                "version": self.content.meta.get("version", "1.0"),
            },
            "settings": settings,
            "stats": stats,
            "chapters": chapters,
            "modules": self.content.meta.get("modules", []),
            "papers": papers,
            "today": stats["today"],
            "plan": self._daily_plan(stats, settings),
        }

    def _chapters_with_progress(self) -> list[dict[str, Any]]:
        summaries = self.content.chapter_summaries()
        progress = self.db.chapter_progress()
        states = self._question_states()
        for chapter in summaries:
            cid = chapter["id"]
            chapter["progress"] = progress.get(cid, {})
            related = [
                q for q in self.content.questions.values() if q["chapter"] == cid
            ]
            seen = sum(1 for q in related if states.get(q["id"], {}).get("seen"))
            right = sum(1 for q in related if states.get(q["id"], {}).get("right"))
            wrong = sum(1 for q in related if states.get(q["id"], {}).get("wrong"))
            chapter["questionSeen"] = seen
            chapter["questionRight"] = right
            chapter["questionWrong"] = wrong
            chapter["mastery"] = (
                round(100 * right / len(related)) if related else 0
            )
        return summaries

    def _question_states(self) -> dict[str, dict[str, Any]]:
        # qstate is small (hundreds of rows); one query per bootstrap is fine.
        with self.db._lock:
            rows = self.db._conn.execute("SELECT * FROM qstate").fetchall()
        return {r["qid"]: dict(r) for r in rows}

    def _daily_plan(self, stats: dict[str, Any], settings: dict[str, str]) -> dict[str, Any]:
        goal = int(settings.get("daily_goal") or 20)
        answered_today = stats["today"]["answered"]
        weak = stats.get("weakChapters") or []
        due = stats["dueReviews"]
        actions = []
        if due:
            actions.append(
                {
                    "kind": "review",
                    "title": f"复习 {due} 道到期错题",
                    "desc": "按遗忘曲线安排的复习，趁热打铁效果最好",
                    "action": "wrongbook",
                }
            )
        if answered_today < goal:
            actions.append(
                {
                    "kind": "practice",
                    "title": f"完成今日 {goal} 道练习",
                    "desc": f"已完成 {answered_today} 道，还差 {max(0, goal - answered_today)} 道",
                    "action": "practice",
                }
            )
        if weak:
            chapter = weak[0]
            actions.append(
                {
                    "kind": "chapter",
                    "title": f"补强「{chapter['title']}」",
                    "desc": f"当前正确率 {chapter['accuracy']}%，建议重读考点再练 10 题",
                    "action": "chapter",
                    "chapterId": chapter["cid"],
                }
            )
        unread = [c for c in self._chapters_with_progress() if not c["progress"].get("read_at")]
        if unread:
            chapter = unread[0]
            actions.append(
                {
                    "kind": "learn",
                    "title": f"开始学习「{chapter['title']}」",
                    "desc": f"约 {chapter['minutes']} 分钟 · {chapter['sections']} 个小节",
                    "action": "chapter",
                    "chapterId": chapter["id"],
                }
            )
        return {
            "goal": goal,
            "answeredToday": answered_today,
            "actions": actions[:3],
        }

    # ------------------------------------------------------------- questions
    def list_questions(self, query: dict[str, Any]) -> dict[str, Any]:
        mode = (query.get("mode") or "chapter").lower()
        states = self._question_states()
        pool: list[dict[str, Any]] = []

        if mode == "wrong":
            ids = {row["qid"] for row in self.db.wrongbook()}
            pool = [q for q in self.content.questions.values() if q["id"] in ids]
        elif mode == "bookmark":
            ids = set(self.db.bookmarks())
            pool = [q for q in self.content.questions.values() if q["id"] in ids]
        elif mode == "random":
            pool = list(self.content.questions.values())
        else:
            cid = query.get("chapter")
            if not cid:
                raise ApiError("缺少章节参数")
            pool = self.content.questions_for_chapter(cid)

        difficulty = query.get("difficulty")
        if difficulty and str(difficulty) != "all":
            pool = [q for q in pool if str(q.get("difficulty", 1)) == str(difficulty)]

        unseen_only = str(query.get("unseen", "")).lower() in {"1", "true", "yes"}
        if unseen_only:
            filtered = [q for q in pool if not states.get(q["id"], {}).get("seen")]
            if filtered:
                pool = filtered

        limit = max(1, min(int(query.get("limit") or 10), 100))
        if str(query.get("order", "random")) == "sequence":
            pool.sort(key=lambda q: q["id"])
        else:
            random.shuffle(pool)
        selected = pool[:limit]
        items = []
        for q in selected:
            item = self.content.public_question(q)
            item["state"] = self._public_state(states.get(q["id"]))
            item["publicBasic"] = self.content.is_public_basic(q)
            items.append(item)
        return {
            "items": items,
            "total": len(pool),
            "mode": mode,
            "chapter": query.get("chapter"),
        }

    @staticmethod
    def _public_state(state: dict[str, Any] | None) -> dict[str, Any]:
        state = state or {}
        return {
            "seen": state.get("seen", 0),
            "right": state.get("right", 0),
            "wrong": state.get("wrong", 0),
            "bookmarked": bool(state.get("bookmarked")),
            "mastered": bool(state.get("mastered")),
            "nextReview": state.get("next_review"),
        }

    def answer(self, payload: dict[str, Any]) -> dict[str, Any]:
        qid = payload.get("questionId")
        choice = payload.get("choice")
        if qid is None or choice is None:
            raise ApiError("缺少题目或选项")
        question = self.content.questions.get(qid)
        if not question:
            raise ApiError("题目不存在", 404)
        try:
            choice = int(choice)
        except (TypeError, ValueError):
            raise ApiError("选项格式错误")
        correct = choice == question["answer"]
        state = self.db.record_answer(
            qid,
            choice,
            correct,
            int(payload.get("durationMs") or 0),
            context=str(payload.get("context") or "practice"),
        )
        full = self.content.full_question(qid)
        full["state"] = self._public_state(state)
        return {"correct": correct, "question": full, "state": self._public_state(state)}

    def toggle_bookmark(self, qid: str, value: bool) -> dict[str, Any]:
        if qid not in self.content.questions:
            raise ApiError("题目不存在", 404)
        self.db.set_bookmark(qid, value)
        return {"bookmarked": value}

    def chapter(self, cid: str) -> dict[str, Any]:
        try:
            chapter = self.content.chapter(cid)
        except KeyError:
            raise ApiError("章节不存在", 404)
        progress = self.db.chapter_progress().get(cid, {})
        chapter["progress"] = progress
        states = self._question_states()
        chapter["questions"] = [
            {
                **self.content.public_question(q),
                "state": self._public_state(states.get(q["id"])),
                "publicBasic": self.content.is_public_basic(q),
            }
            for q in chapter["questions"]
        ]
        return chapter

    def mark_chapter(self, cid: str, payload: dict[str, Any]) -> dict[str, Any]:
        if cid not in self.content.chapters:
            raise ApiError("章节不存在", 404)
        self.db.mark_chapter(
            cid,
            int(payload.get("section") or 0),
            int(payload.get("seconds") or 0),
        )
        return {"ok": True}

    def wrongbook(self) -> dict[str, Any]:
        rows = self.db.wrongbook()
        states = {r["qid"]: r for r in rows}
        items = []
        for q in self.content.questions.values():
            if q["id"] not in states:
                continue
            state = states[q["id"]]
            item = self.content.public_question(q)
            item["state"] = self._public_state(state)
            item["lastResult"] = state.get("last_result")
            item["lastSeen"] = state.get("last_seen")
            item["nextReview"] = state.get("next_review")
            item["chapterTitle"] = self.content.chapters.get(q["chapter"], {}).get("title", "")
            items.append(item)
        items.sort(key=lambda x: x.get("nextReview") or "")
        due = [i for i in items if (i.get("nextReview") or "9999") <= today()]
        return {"items": items, "total": len(items), "due": len(due)}

    def remove_wrong(self, qid: str) -> dict[str, Any]:
        self.db.remove_from_wrongbook(qid)
        return {"ok": True}

    def bookmarks(self) -> dict[str, Any]:
        ids = set(self.db.bookmarks())
        states = self._question_states()
        items = []
        for q in self.content.questions.values():
            if q["id"] in ids:
                item = self.content.public_question(q)
                item["state"] = self._public_state(states.get(q["id"]))
                item["chapterTitle"] = self.content.chapters.get(q["chapter"], {}).get("title", "")
                items.append(item)
        return {"items": items, "total": len(items)}

    # ------------------------------------------------------------- exercises
    def exercises(self) -> dict[str, Any]:
        items = []
        for exercise in self.content.exercises.values():
            state = self.db.exercise_state(exercise["id"])
            items.append(
                {
                    "id": exercise["id"],
                    "title": exercise["title"],
                    "chapter": exercise.get("chapter"),
                    "chapterTitle": self.content.chapters.get(exercise.get("chapter"), {}).get(
                        "title", ""
                    ),
                    "difficulty": exercise.get("difficulty", 1),
                    "level": exercise.get("level", "basic"),
                    "points": exercise.get("points", 15),
                    "tags": exercise.get("tags", []),
                    "testCount": len(exercise.get("tests", [])),
                    "state": {
                        "attempts": state["attempts"],
                        "solved": bool(state["solved"]),
                        "bestScore": state["best_score"],
                        "lastPassed": state["passed"],
                    },
                }
            )
        items.sort(key=lambda x: (x["difficulty"], x["id"]))
        solved = sum(1 for i in items if i["state"]["solved"])
        return {"items": items, "total": len(items), "solved": solved}

    def exercise(self, eid: str) -> dict[str, Any]:
        exercise = self.content.exercises.get(eid)
        if not exercise:
            raise ApiError("代码题不存在", 404)
        data = self.content.exercise_public(exercise)
        data["state"] = self.db.exercise_state(eid)
        data["chapterTitle"] = self.content.chapters.get(exercise.get("chapter"), {}).get(
            "title", ""
        )
        return data

    def run_snippet(self, payload: dict[str, Any]) -> dict[str, Any]:
        code = str(payload.get("code") or "")
        if not code.strip():
            raise ApiError("没有可运行的代码")
        return run_code(code, str(payload.get("stdin") or ""), timeout=6)

    def run_exercise(self, eid: str, payload: dict[str, Any]) -> dict[str, Any]:
        exercise = self.content.exercises.get(eid)
        if not exercise:
            raise ApiError("代码题不存在", 404)
        code = str(payload.get("code") or "")
        if not code.strip():
            raise ApiError("请先编写代码")
        tests = exercise.get("tests", [])
        if str(payload.get("scope") or "all") == "sample":
            samples = exercise.get("samples", [])
            tests = [
                {
                    "name": s.get("name") or "样例",
                    "stdin": s.get("stdin", ""),
                    "stdout": s.get("stdout", ""),
                    "mode": s.get("mode", "exact"),
                    "files": s.get("files"),
                }
                for s in samples
            ] or tests[:1]
        result = grade(code, tests)
        points = int(exercise.get("points") or 15)
        score = round(points * result["passed"] / max(1, result["total"]))
        state = self.db.record_exercise(eid, code, result["passed"], result["total"], score)
        result["score"] = score
        result["points"] = points
        result["state"] = state
        result["solution"] = exercise.get("solution", "") if result["allPassed"] else ""
        return result

    def reveal_solution(self, eid: str) -> dict[str, Any]:
        exercise = self.content.exercises.get(eid)
        if not exercise:
            raise ApiError("代码题不存在", 404)
        return {"solution": exercise.get("solution", ""), "analysis": exercise.get("analysis", "")}

    # ------------------------------------------------------------------ exam
    def start_exam(self, payload: dict[str, Any]) -> dict[str, Any]:
        key = payload.get("paper") or "mock"
        paper = self.content.meta.get("papers", {}).get(key)
        if not paper:
            raise ApiError("试卷不存在", 404)
        seed = f"{key}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
        rng = random.Random(seed)
        questions: list[dict[str, Any]] = []
        used: set[str] = set()
        for cid, count in paper.get("counts", {}).items():
            pool = [
                q
                for q in self.content.questions_for_chapter(cid)
                if q["id"] not in used
            ]
            rng.shuffle(pool)
            for question in pool[:count]:
                used.add(question["id"])
                questions.append(question)
        if not questions:
            raise ApiError("题库内容不足，无法组卷", 500)
        rng.shuffle(questions)
        tasks = []
        for level in paper.get("codingLevels", []):
            pool = [
                e
                for e in self.content.exercises.values()
                if e.get("level") == level
            ]
            rng.shuffle(pool)
            if pool:
                tasks.append(pool[0])
        total_choice = sum(paper.get("counts", {}).values())
        exam_id = "ex-" + datetime.now().strftime("%y%m%d%H%M%S") + "-" + secrets.token_hex(2)
        self.db.create_exam(
            exam_id,
            key,
            {
                "questions": [q["id"] for q in questions],
                "tasks": [t["id"] for t in tasks],
                "paper": key,
                "seed": seed,
            },
        )
        public_questions = []
        for index, question in enumerate(questions, start=1):
            item = self.content.public_question(question)
            item["number"] = index
            item["publicBasic"] = self.content.is_public_basic(question)
            public_questions.append(item)
        public_tasks = []
        for index, task in enumerate(tasks, start=1):
            item = self.content.exercise_public(task, include_solution=False)
            item["number"] = index
            public_tasks.append(item)
        return {
            "sessionId": exam_id,
            "paper": {
                "key": key,
                "title": paper.get("title", "模拟考试"),
                "duration": paper.get("duration", 120),
                "choicePoints": paper.get("choicePoints", 1),
                "totalChoice": total_choice,
                "codingLevels": paper.get("codingLevels", []),
            },
            "questions": public_questions,
            "tasks": public_tasks,
            "startedAt": datetime.now().isoformat(timespec="seconds"),
        }

    def submit_exam(self, payload: dict[str, Any]) -> dict[str, Any]:
        exam_id = payload.get("sessionId")
        if not exam_id:
            raise ApiError("缺少考试会话")
        record = self.db.exam(exam_id)
        if not record:
            raise ApiError("考试不存在", 404)
        if record.get("finished_at"):
            return {"alreadySubmitted": True, "result": record.get("detail"), "score": record.get("score")}
        stub = record.get("answers") or {}
        paper_key = stub.get("paper", "mock")
        paper = self.content.meta.get("papers", {}).get(paper_key, {})
        answers = payload.get("answers") or {}
        codes = payload.get("codes") or {}
        duration = int(payload.get("durationSec") or 0)

        choice_items = []
        correct_count = 0
        for qid in stub.get("questions", []):
            question = self.content.questions.get(qid)
            if not question:
                continue
            chosen = answers.get(qid)
            try:
                chosen_int = int(chosen) if chosen is not None else None
            except (TypeError, ValueError):
                chosen_int = None
            ok = chosen_int == question["answer"]
            if ok:
                correct_count += 1
            if chosen_int is not None:
                self.db.record_answer(
                    qid, chosen_int, ok, 0, context="exam", kind="exam"
                )
            choice_items.append(
                {
                    "qid": qid,
                    "chapter": question["chapter"],
                    "stem": question["stem"],
                    "options": question["options"],
                    "chosen": chosen_int,
                    "answer": question["answer"],
                    "correct": ok,
                    "explanation": question.get("explanation", ""),
                    "code": question.get("code"),
                }
            )

        choice_total = len(choice_items)
        choice_points = int(paper.get("choicePoints", 1))
        choice_score = correct_count * choice_points

        coding_items = []
        coding_score = 0
        total_coding_points = 0
        for eid in stub.get("tasks", []):
            exercise = self.content.exercises.get(eid)
            if not exercise:
                continue
            points = int(exercise.get("points") or 15)
            total_coding_points += points
            code = str(codes.get(eid) or "")
            if not code.strip():
                coding_items.append(
                    {
                        "eid": eid,
                        "title": exercise["title"],
                        "points": points,
                        "awarded": 0,
                        "passed": 0,
                        "total": len(exercise.get("tests", [])),
                        "unanswered": True,
                        "results": [],
                    }
                )
                continue
            result = grade(code, exercise.get("tests", []))
            awarded = round(points * result["passed"] / max(1, result["total"]))
            coding_score += awarded
            self.db.record_exercise(
                eid, code, result["passed"], result["total"], awarded
            )
            coding_items.append(
                {
                    "eid": eid,
                    "title": exercise["title"],
                    "points": points,
                    "awarded": awarded,
                    "passed": result["passed"],
                    "total": result["total"],
                    "results": result["results"],
                    "solution": exercise.get("solution", ""),
                }
            )

        total_possible = choice_total * choice_points + total_coding_points
        score = round(100 * (choice_score + coding_score) / max(1, total_possible), 1)

        by_chapter: dict[str, dict[str, Any]] = {}
        for item in choice_items:
            entry = by_chapter.setdefault(
                item["chapter"], {"cid": item["chapter"], "correct": 0, "total": 0}
            )
            entry["total"] += 1
            entry["correct"] += 1 if item["correct"] else 0
        for entry in by_chapter.values():
            chapter = self.content.chapters.get(entry["cid"], {})
            entry["title"] = chapter.get("title", entry["cid"])

        detail = {
            "paper": paper_key,
            "paperTitle": paper.get("title", "模拟考试"),
            "choice": {
                "correct": correct_count,
                "total": choice_total,
                "score": choice_score,
                "maxScore": choice_total * choice_points,
                "items": choice_items,
            },
            "coding": {
                "score": coding_score,
                "maxScore": total_coding_points,
                "items": coding_items,
            },
            "byChapter": sorted(by_chapter.values(), key=lambda x: x["title"]),
            "durationSec": duration,
            "passScore": paper.get("passScore", 60),
        }
        self.db.finish_exam(exam_id, score, detail, duration)
        return {
            "sessionId": exam_id,
            "score": score,
            "passed": score >= paper.get("passScore", 60),
            "detail": detail,
        }

    def exam_result(self, exam_id: str) -> dict[str, Any]:
        record = self.db.exam(exam_id)
        if not record or not record.get("detail"):
            raise ApiError("成绩不存在", 404)
        return {"sessionId": exam_id, "score": record["score"], "detail": record["detail"]}

    # ----------------------------------------------------------------- stats
    def stats(self) -> dict[str, Any]:
        totals = self.db.totals()
        states = self._question_states()
        chapters = self.content.chapters
        by_chapter: dict[str, dict[str, Any]] = {}
        for cid, chapter in chapters.items():
            by_chapter[cid] = {
                "cid": cid,
                "title": chapter["title"],
                "module": chapter.get("module"),
                "answered": 0,
                "correct": 0,
            }
        for qid, state in states.items():
            question = self.content.questions.get(qid)
            if not question:
                continue
            entry = by_chapter[question["chapter"]]
            entry["answered"] += state.get("seen", 0)
            entry["correct"] += state.get("right", 0)
        for entry in by_chapter.values():
            entry["accuracy"] = (
                round(100 * entry["correct"] / entry["answered"]) if entry["answered"] else None
            )
            entry["totalQuestions"] = len(
                [q for q in self.content.questions.values() if q["chapter"] == entry["cid"]]
            )
            entry["seenQuestions"] = len(
                [
                    q
                    for q in self.content.questions.values()
                    if q["chapter"] == entry["cid"] and states.get(q["id"], {}).get("seen")
                ]
            )

        modules = []
        for module in self.content.meta.get("modules", []):
            entries = [e for e in by_chapter.values() if e["module"] == module["id"]]
            answered = sum(e["answered"] for e in entries)
            correct = sum(e["correct"] for e in entries)
            total_q = sum(e["totalQuestions"] for e in entries)
            seen_q = sum(e["seenQuestions"] for e in entries)
            modules.append(
                {
                    "id": module["id"],
                    "name": module["name"],
                    "color": module.get("color", "#6366f1"),
                    "answered": answered,
                    "accuracy": round(100 * correct / answered) if answered else None,
                    "coverage": round(100 * seen_q / total_q) if total_q else 0,
                }
            )

        weak = [
            e
            for e in by_chapter.values()
            if e["answered"] >= 3 and (e["accuracy"] or 0) < 75
        ]
        weak.sort(key=lambda e: (e["accuracy"] or 0, -e["answered"]))

        activity = self.db.activity(30)
        today_row = next((d for d in activity if d["day"] == today()), {"seconds": 0, "answered": 0, "correct": 0})
        wrong_rows = self.db.wrongbook()
        recent_wrong = []
        for row in sorted(wrong_rows, key=lambda r: r.get("last_seen") or "", reverse=True)[:6]:
            question = self.content.questions.get(row["qid"])
            if not question:
                continue
            recent_wrong.append(
                {
                    "qid": row["qid"],
                    "stem": question["stem"][:90],
                    "wrong": row["wrong"],
                    "chapterTitle": chapters.get(question["chapter"], {}).get("title", ""),
                }
            )

        exercises = self.exercises()
        coverage = round(100 * len(states) / max(1, len(self.content.questions)))
        accuracy = (
            round(100 * totals["correct"] / totals["answered"]) if totals["answered"] else None
        )
        return {
            "totals": totals,
            "accuracy": accuracy,
            "coverage": coverage,
            "streak": self.db.streak(),
            "byChapter": list(by_chapter.values()),
            "modules": modules,
            "activity": activity,
            "weakChapters": weak[:5],
            "recentWrong": recent_wrong,
            "dueReviews": len(
                [r for r in wrong_rows if (r.get("next_review") or "9999") <= today()]
            ),
            "wrongCount": len(wrong_rows),
            "bookmarkCount": len(self.db.bookmarks()),
            "exercises": {"solved": exercises["solved"], "total": exercises["total"]},
            "exams": self.db.exams(10),
            "today": {
                "answered": today_row["answered"],
                "correct": today_row["correct"],
                "seconds": today_row["seconds"],
            },
            "examDate": self.db.get_settings().get("exam_date", ""),
            "daysLeft": self._days_left(self.db.get_settings().get("exam_date", "")),
        }

    @staticmethod
    def _days_left(exam_date: str) -> int | None:
        if not exam_date:
            return None
        try:
            target = datetime.strptime(exam_date, "%Y-%m-%d").date()
        except ValueError:
            return None
        return (target - datetime.now().date()).days

    # ----------------------------------------------------------- cheatsheet
    def cheatsheet(self) -> dict[str, Any]:
        return self.content.cheatsheet

    # ------------------------------------------------------------- settings
    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        allowed = {"theme", "exam_date", "daily_goal", "reduce_motion", "nickname", "onboarded"}
        patch = {k: v for k, v in payload.items() if k in allowed}
        if "daily_goal" in patch:
            try:
                patch["daily_goal"] = str(max(5, min(int(patch["daily_goal"]), 200)))
            except (TypeError, ValueError):
                raise ApiError("每日目标必须是数字")
        if "exam_date" in patch and patch["exam_date"]:
            try:
                datetime.strptime(str(patch["exam_date"]), "%Y-%m-%d")
            except ValueError:
                raise ApiError("考试日期格式应为 YYYY-MM-DD")
        return self.db.set_settings(patch)

    def heartbeat(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.db.add_seconds(int(payload.get("seconds") or 0))
        return {"ok": True}

    def reset(self) -> dict[str, Any]:
        self.db.reset_progress()
        return {"ok": True}

    def export_data(self) -> dict[str, Any]:
        return self.db.export_json()

    def import_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            self.db.import_json(payload or {})
        except (ValueError, KeyError, TypeError) as exc:
            raise ApiError(f"备份文件无效：{exc}")
        return {"ok": True}
