"""End-to-end HTTP smoke test for the local app (uses a temporary data dir)."""
from __future__ import annotations

import json
import re
import sys
import urllib.request


class Client:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        with urllib.request.urlopen(self.base + "/", timeout=10) as response:
            html = response.read().decode("utf-8")
        match = re.search(r'window\.__APP_TOKEN__ = "([^"]+)"', html)
        if not match:
            raise RuntimeError("无法从首页提取访问令牌")
        self.token = match.group(1)

    def call(self, path: str, method: str = "GET", payload=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={
                "X-App-Token": self.token,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))


def check(condition, message, problems):
    print(("[ OK ] " if condition else "[FAIL] ") + message)
    if not condition:
        problems.append(message)


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    client = Client(base)
    problems = []

    boot = client.call("/api/bootstrap")
    check(len(boot["chapters"]) == 13, "13 个章节", problems)
    check(boot["stats"]["totals"]["answered"] == 0, "初始答题数为 0", problems)
    total_questions = sum(c["questionCount"] for c in boot["chapters"])
    check(total_questions == 260, f"题库共 260 题（实际 {total_questions}）", problems)
    check(len(boot["papers"]) == 2, "两套试卷", problems)

    chapter = client.call("/api/chapter/ch01")
    check(len(chapter["sections"]) >= 10, "第一章内容完整", problems)
    check(len(chapter["questions"]) == 20, "第一章 20 道题", problems)

    question = chapter["questions"][0]
    answer = client.call(
        "/api/answer",
        "POST",
        {"questionId": question["id"], "choice": 0, "durationMs": 1200, "context": "test"},
    )
    check("correct" in answer and answer["question"]["explanation"], "答题返回判分与解析", problems)

    # Pick a definitely wrong choice and verify wrong book.
    wrong_choice = (answer["question"]["answer"] + 1) % len(answer["question"]["options"])
    client.call(
        "/api/answer",
        "POST",
        {"questionId": question["id"], "choice": wrong_choice, "durationMs": 900, "context": "test"},
    )
    wrongbook = client.call("/api/wrongbook")
    check(any(item["id"] == question["id"] for item in wrongbook["items"]), "错题进入错题本", problems)

    exercises = client.call("/api/exercises")
    check(len(exercises["items"]) == 30, "30 道代码题", problems)
    first = exercises["items"][0]
    detail = client.call(f"/api/exercise/{first['id']}")
    check(detail["testCount"] > 0, "代码题返回测试点", problems)

    run = client.call(
        f"/api/exercise/{first['id']}/run",
        "POST",
        {"code": client.call(f"/api/exercise/{first['id']}/solution")["solution"], "scope": "all"},
    )
    check(run["allPassed"], "参考答案通过全部测试点", problems)
    check(run["score"] == run["points"], "满分计算正确", problems)

    exam = client.call("/api/exam/start", "POST", {"paper": "mock"})
    check(len(exam["questions"]) == 40, f"模拟卷 40 道选择题（实际 {len(exam['questions'])}）", problems)
    check(len(exam["tasks"]) == 3, "模拟卷 3 道操作题", problems)
    check(exam["questions"][0].get("answer") is None, "考试接口不泄露答案", problems)

    submitted = client.call(
        "/api/exam/submit",
        "POST",
        {"sessionId": exam["sessionId"], "answers": {}, "codes": {}, "durationSec": 30},
    )
    check(submitted["score"] == 0, "空白卷 0 分", problems)
    check(len(submitted["detail"]["choice"]["items"]) == 40, "成绩单包含 40 题解析", problems)
    result = client.call(f"/api/exam/{exam['sessionId']}")
    check(result["score"] == submitted["score"], "成绩可回看", problems)

    cheat = client.call("/api/cheatsheet")
    check(len(cheat["groups"]) >= 8, "速查表内容完整", problems)

    stats = client.call("/api/stats")
    check(stats["totals"]["answered"] >= 2, "统计数据已累计", problems)
    check(stats["wrongCount"] >= 1, "统计包含错题数", problems)

    export = client.call("/api/export")
    check(export["app"] == "PythonLevel2Tutor", "可以导出备份", problems)

    if problems:
        print(f"\n失败 {len(problems)} 项")
        return 1
    print("\n全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
