"""Rebalance correct-option positions so answers are not concentrated on one letter.

Explanations must not refer to option positions. Questions listed in SKIP are left
untouched because their explanation refers to "第一组" style ordering.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS = ROOT / "content" / "questions"
SKIP = {"q0113"}
TARGETS = [0, 1, 2, 3]


def main() -> int:
    apply = "--apply" in sys.argv
    files = sorted(QUESTIONS.glob("*.json"))
    payloads = {path: json.loads(path.read_text(encoding="utf-8")) for path in files}
    before = Counter()
    after = Counter()
    changed = 0
    counter = 0

    for path, payload in payloads.items():
        for question in payload.get("questions", []):
            options = question["options"]
            before[question["answer"]] += 1
            if question["id"] in SKIP or len(options) != 4:
                after[question["answer"]] += 1
                continue
            target = TARGETS[counter % len(TARGETS)]
            counter += 1
            if question["answer"] == target:
                after[target] += 1
                continue
            correct = options[question["answer"]]
            rest = [option for index, option in enumerate(options) if index != question["answer"]]
            new_options = rest[:target] + [correct] + rest[target:]
            if sorted(new_options) != sorted(options):
                raise RuntimeError(f"{question['id']} 选项重排后不一致")
            question["options"] = new_options
            question["answer"] = target
            after[target] += 1
            changed += 1

    print("调整前:", dict(sorted(before.items())))
    print("调整后:", dict(sorted(after.items())))
    print("调整题目数:", changed)
    if not apply:
        print("dry-run，未写入。加 --apply 写入文件。")
        return 0

    for path, payload in payloads.items():
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print("已写入", len(files), "个文件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
