"""Validate bundled curriculum: schema, cross references, runnable examples, exercise tests."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.content import Content  # noqa: E402
from app.runner import grade, normalize_output, run_code  # noqa: E402


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    content = Content()
    problems: list[str] = []
    warnings: list[str] = []

    print(f"章节: {len(content.chapters)}")
    print(f"选择题: {len(content.questions)}")
    print(f"代码题: {len(content.exercises)}")

    # Cross references
    for chapter in content.chapters.values():
        for section in chapter.get("sections", []):
            if section.get("type") == "quiz":
                qid = section.get("qid")
                if qid not in content.questions:
                    problems.append(f"{chapter['id']} 引用了不存在的题目 {qid}")
                else:
                    question = content.questions[qid]
                    if question["chapter"] != chapter["id"]:
                        warnings.append(f"{qid} 被 {chapter['id']} 引用，但属于 {question['chapter']}")
    for exercise in content.exercises.values():
        if exercise.get("chapter") not in content.chapters:
            problems.append(f"{exercise['id']} 引用了不存在的章节")

    # Counts
    per_chapter = {}
    for question in content.questions.values():
        per_chapter[question["chapter"]] = per_chapter.get(question["chapter"], 0) + 1
    for cid in content.chapters:
        if per_chapter.get(cid, 0) < 10:
            problems.append(f"{cid} 题目不足 10 道（{per_chapter.get(cid, 0)}）")
    print("每章题量:", ", ".join(f"{cid}:{per_chapter.get(cid, 0)}" for cid in content.chapters))

    levels: dict[str, int] = {}
    for exercise in content.exercises.values():
        levels[exercise.get("level", "basic")] = levels.get(exercise.get("level", "basic"), 0) + 1
    print("代码题难度分布:", levels)

    # Chapter code examples
    print("\n== 运行章节示例 ==")
    failures = 0
    for cid in sorted(content.chapters):
        chapter = content.chapters[cid]
        for index, section in enumerate(chapter.get("sections", []), start=1):
            if section.get("type") != "code" or section.get("run") is False:
                continue
            result = run_code(section["code"], section.get("stdin", ""), timeout=6)
            label = f"{cid} 示例{index} {section.get('title', '')}"
            if not result["ok"]:
                failures += 1
                problems.append(f"{label} 运行失败: {result['stderr'][:300]}")
                print(f"[FAIL] {label}")
            else:
                print(f"[ OK ] {label}")
    print(f"示例运行失败: {failures}")

    # Exercises
    print("\n== 验证代码题 ==")
    for eid in sorted(content.exercises):
        exercise = content.exercises[eid]
        solution = exercise["solution"]
        tests = exercise["tests"]
        result = grade(solution, tests, timeout=6)
        if not result["allPassed"]:
            problems.append(f"{eid} 参考答案未通过全部测试 ({result['passed']}/{result['total']})")
            print(f"[FAIL] {eid} {exercise['title']} {result['passed']}/{result['total']}")
            for item in result["results"]:
                if not item["passed"]:
                    print(
                        f"       测试 {item['index']} {item['name']}: "
                        f"期望 {normalize_output(item['expected'])!r} "
                        f"实际 {normalize_output(item['actual'])!r} "
                        f"stderr={item['stderr'][:200]!r}"
                    )
        else:
            print(f"[ OK ] {eid} {exercise['title']} ({result['total']} 项)")
        # Samples should agree with tests / solution
        for sample in exercise.get("samples", []):
            outcome = run_code(solution, sample.get("stdin", ""), timeout=6, files=sample.get("files"))
            if not outcome["ok"] or normalize_output(outcome["stdout"]) != normalize_output(sample["stdout"]):
                problems.append(f"{eid} 样例输出与参考程序不一致")
                print(f"       样例不一致: 期望 {sample['stdout']!r} 实际 {outcome['stdout']!r}")

    print("\n== 结果 ==")
    if warnings:
        print("警告:")
        for item in warnings:
            print(" -", item)
    if problems:
        print("问题:")
        for item in problems:
            print(" -", item)
        print(f"\n共 {len(problems)} 个问题")
        return 1
    print("全部通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
