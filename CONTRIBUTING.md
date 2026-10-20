# Contributing

感谢你愿意改进这个项目。提交前请先确认改动符合下面的约定。

## 开发环境

```powershell
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
python -m app.main
```

只调试前端时：

```powershell
python -m app.main --server-only --port 8765
```

## 提交前必须通过

```powershell
python tools/validate_content.py
```

如果修改了题目或选项顺序，建议再跑：

```powershell
python tools/rebalance_answers.py
```

接口改动请补跑冒烟测试（另开一个终端启动服务）：

```powershell
$env:PYL2_DATA_DIR = "$env:TEMP\pyl2-smoke"
python -m app.main --server-only --port 8765
python tools/smoke_test.py http://127.0.0.1:8765
```

## 内容规范

- 新增题目使用 `content/questions/qNN.json`，`answer` 是正确选项的 **0 基下标**。
- 每题必须有 `explanation`，说明为什么正确、其他选项错在哪里。
- 不要在解析里写“第一组/第二组”这类依赖选项顺序的表述；如果必须写，请使用内容而不是位置。
- 编程题的 `tests` 必须能被参考答案通过；输出按标准输出逐行比较。
- 请勿提交历年真题原文、受版权保护的教材段落或来源不明的题目。
- 新增内容默认按 CC BY-NC-SA 4.0 授权；代码贡献默认按 MIT 授权。

## 代码风格

- Python 3.10+，使用标准库为主，避免引入不必要依赖。
- 保持现有分层：`app/` 后端、`web/` 前端、`content/` 内容、`tools/` 校验脚本。
- 前端使用原生 ES Modules，不引入构建工具。
- 不要提交 `.venv/`、`release/`、`build/`、学习数据或日志。

## Pull Request

- 一个 PR 尽量只做一件事。
- 说明改动内容、验证方式和截图（涉及界面时）。
- 如果新增或修改题目，请附上 `validate_content.py` 的输出摘要。
