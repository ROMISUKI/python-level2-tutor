import { api } from "../api.js";
import { onCleanup, refreshData } from "../app.js";
import { icon, esc, toast, levelLabel, openModal, confirmDialog, highlightPython } from "../ui.js";

const LEVELS = [
  { id: "all", label: "全部" },
  { id: "basic", label: "基本操作" },
  { id: "simple", label: "简单应用" },
  { id: "comprehensive", label: "综合应用" },
];

let listFilter = "all";

export async function render(root, { parts }) {
  if (parts[0]) {
    await renderDetail(root, parts[0]);
    return;
  }
  await renderList(root);
}

async function renderList(root) {
  const data = await api.exercises();
  const items = listFilter === "all" ? data.items : data.items.filter((item) => item.level === listFilter);

  root.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Code Lab</div>
        <h1 class="page-title">代码练习</h1>
        <p class="page-sub">30 道编程题，按真实考试的基本操作、简单应用、综合应用三级难度编排。代码在本机隔离进程中运行，自动对照测试点判分。</p>
      </div>
      <div class="page-actions">
        <span class="badge badge-green">${icon("check", 12)} 已通过 ${data.solved}/${data.total}</span>
      </div>
    </div>

    <div class="module-row">
      ${LEVELS.map(
        (level) => `<button class="chip ${listFilter === level.id ? "active" : ""}" data-level="${level.id}">${level.label}</button>`
      ).join("")}
    </div>

    <div class="grid grid-2">
      ${items
        .map((item) => {
          const solved = item.state.solved;
          return `<a class="card" href="#/code/${item.id}" style="padding:18px;display:block">
            <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">
              <div class="row" style="gap:7px;flex-wrap:wrap">
                <span class="badge ${solved ? "badge-green" : "badge-primary"}">${levelLabel(item.level)}</span>
                <span class="badge badge-outline">${item.points} 分</span>
                <span class="badge">${"★".repeat(item.difficulty)}</span>
              </div>
              ${solved ? `<span class="chapter-read">${icon("check", 13)} 已通过</span>` : item.state.attempts ? `<span class="badge badge-amber">最好 ${item.state.bestScore} 分</span>` : ""}
            </div>
            <h3 style="margin:11px 0 4px;font-size:15.5px">${esc(item.title)}</h3>
            <div class="tiny muted">${esc(item.chapterTitle)} · ${item.tags.map(esc).join(" / ")}</div>
            <div class="row tiny muted" style="margin-top:12px;gap:12px">
              <span>${icon("terminal", 13)} ${item.state.attempts} 次尝试</span>
              <span>${icon("file", 13)} ${item.testCount || 4} 个测试点</span>
            </div>
          </a>`;
        })
        .join("")}
    </div>
  </div>`;

  root.querySelectorAll("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      listFilter = button.dataset.level;
      renderList(root);
    });
  });
}

async function renderDetail(root, eid) {
  let exercise;
  try {
    exercise = await api.exercise(eid);
  } catch (error) {
    root.innerHTML = `<div class="page"><div class="card"><div class="card-body"><h2>题目不存在</h2><p class="muted">${esc(error.message)}</p><a class="btn btn-primary" href="#/code">返回代码练习</a></div></div></div>`;
    return;
  }

  const sample = exercise.samples?.[0];
  const files = sample?.files ? Object.keys(sample.files) : [];

  root.innerHTML = `<div class="page">
    <div class="row small muted" style="margin-bottom:14px">
      <a href="#/code" class="row" style="gap:5px">${icon("arrowLeft", 14)} 代码练习</a>
      <span>/</span><span>${esc(exercise.chapterTitle)}</span>
    </div>

    <div class="code-layout">
      <section class="problem-card">
        <div class="row" style="gap:7px;flex-wrap:wrap">
          <span class="badge badge-primary">${levelLabel(exercise.level)}</span>
          <span class="badge badge-outline">${exercise.points} 分</span>
          <span class="badge">${"★".repeat(exercise.difficulty)}</span>
          ${exercise.state?.solved ? `<span class="badge badge-green">${icon("check", 11)} 已通过</span>` : ""}
        </div>
        <h2>${esc(exercise.title)}</h2>
        <p>${esc(exercise.statement)}</p>

        <h4>输入格式</h4>
        <div class="spec-box">${esc(exercise.inputSpec)}</div>
        <h4>输出格式</h4>
        <div class="spec-box">${esc(exercise.outputSpec)}</div>

        ${sample
          ? `<h4>样例</h4>
            <div class="sample-box">
              <div class="sample-head">${files.length ? `测试文件：${files.map(esc).join("、")}` : "标准输入 / 标准输出"}</div>
              <div class="sample-body">
                <div><div class="sample-label">输入</div><pre>${esc(sample.stdin || "（无需输入）")}</pre></div>
                <div><div class="sample-label">输出</div><pre>${esc(sample.stdout)}</pre></div>
              </div>
            </div>`
          : ""}

        <h4>涉及考点</h4>
        <div class="row" style="gap:6px;flex-wrap:wrap">${exercise.knowledge.map((k) => `<span class="badge">${esc(k)}</span>`).join("")}</div>

        <div style="margin-top:18px" class="hint-box">
          <button class="hint-head" id="hint-toggle">${icon("bulb", 15)} 卡住了？看提示 <span class="spacer"></span>${icon("chevronDown", 14)}</button>
          <div class="hint-body hidden" id="hint-body">
            <ol>${exercise.hints.map((hint) => `<li>${esc(hint)}</li>`).join("")}</ol>
          </div>
        </div>
      </section>

      <section class="editor-col">
        <div class="editor-shell">
          <div class="editor-bar">
            <span class="dot"></span><span class="filename">main.py</span>
            <span class="spacer"></span>
            <button class="btn btn-sm btn-ghost" id="reset-code">重置</button>
          </div>
          <textarea id="editor"></textarea>
        </div>
        <div class="run-bar">
          <button class="btn btn-ghost" id="run-sample">${icon("play", 15)} 运行样例</button>
          <button class="btn btn-primary" id="run-all">${icon("check", 15)} 提交测试</button>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" id="show-solution">${icon("bulb", 14)} 参考答案</button>
        </div>
        <div class="test-panel">
          <div class="test-panel-head">${icon("terminal", 15)} 测试结果 <span class="spacer"></span><span class="tiny muted" id="test-summary">尚未运行</span></div>
          <div class="test-list" id="test-list">
            <div class="test-row"><span class="muted small">点击「提交测试」后，这里会显示每个测试点的结果。</span></div>
          </div>
        </div>
        <div class="console hidden" id="console">
          <div class="console-head"><span>程序输出</span><span id="console-time"></span></div>
          <pre></pre>
        </div>
      </section>
    </div>
  </div>`;

  const textarea = document.getElementById("editor");
  const editor = CodeMirror.fromTextArea(textarea, {
    mode: "python",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    lineWrapping: true,
    extraKeys: {
      Tab: (cm) => cm.replaceSelection("    "),
      "Ctrl-Enter": () => run("all"),
      "Cmd-Enter": () => run("all"),
    },
  });
  const starter = exercise.starter || "# 请在此处编写代码\n";
  editor.setValue(exercise.state?.last_code || starter);
  editor.setCursor(editor.lineCount(), 0);
  onCleanup(() => {
    const wrapper = editor.getWrapperElement();
    wrapper.remove();
  });

  document.getElementById("hint-toggle").addEventListener("click", () => {
    document.getElementById("hint-body").classList.toggle("hidden");
  });

  document.getElementById("reset-code").addEventListener("click", async () => {
    const ok = await confirmDialog("重置代码？", "当前编辑器中的代码会被清空，恢复为初始模板。", { okLabel: "重置", danger: true });
    if (ok) {
      editor.setValue(starter);
      document.getElementById("test-list").innerHTML = `<div class="test-row"><span class="muted small">点击「提交测试」后，这里会显示每个测试点的结果。</span></div>`;
      document.getElementById("test-summary").textContent = "尚未运行";
      document.getElementById("console").classList.add("hidden");
    }
  });

  function showConsole(text, isError) {
    const consoleEl = document.getElementById("console");
    consoleEl.classList.remove("hidden");
    consoleEl.querySelector("pre").textContent = text || "（没有输出）";
    consoleEl.querySelector("pre").classList.toggle("err", Boolean(isError));
    document.getElementById("console-time").textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  }

  function renderTests(result) {
    const summary = document.getElementById("test-summary");
    summary.textContent = `${result.passed}/${result.total} 通过 · ${result.score}/${result.points} 分`;
    summary.style.color = result.allPassed ? "var(--green)" : "var(--amber)";
    document.getElementById("test-list").innerHTML = result.results
      .map((test) => {
        const detail = test.passed
          ? `用时 ${test.durationMs} ms`
          : [
              test.stderr ? `错误：${test.stderr.trim().split("\n").slice(-3).join("\n")}` : "",
              `期望：${test.expected.trim() || "（空）"}`,
              `实际：${test.actual.trim() || "（空）"}`,
            ]
              .filter(Boolean)
              .join("\n");
        return `<div class="test-row">
          <span class="test-icon ${test.passed ? "test-pass" : "test-fail"}">${test.passed ? "✓" : "×"}</span>
          <div class="grow">
            <div class="test-name">${esc(test.name)} ${test.passed ? "" : '<span class="tiny muted">未通过</span>'}</div>
            <div class="test-detail">${esc(detail)}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  async function run(scope) {
    const code = editor.getValue();
    if (!code.trim()) {
      toast("请先编写代码", "error");
      return;
    }
    const buttons = [document.getElementById("run-sample"), document.getElementById("run-all")];
    buttons.forEach((button) => { button.disabled = true; });
    document.getElementById("test-summary").textContent = "运行中…";
    try {
      const result = await api.runExercise(exercise.id, code, scope);
      renderTests(result);
      const firstFail = result.results.find((test) => !test.passed);
      if (firstFail) {
        showConsole([firstFail.stderr, firstFail.actual].filter(Boolean).join("\n"), true);
      } else {
        showConsole(result.results.map((test) => `✓ ${test.name}`).join("\n"), false);
      }
      if (result.allPassed) {
        toast(`全部通过，获得 ${result.points} 分`, "success");
        if (result.solution) {
          document.getElementById("show-solution").dataset.ready = "1";
        }
        refreshData().catch(() => {});
      } else {
        toast(`${result.passed}/${result.total} 个测试点通过`, "");
        refreshData().catch(() => {});
      }
    } catch (error) {
      toast(error.message, "error");
      showConsole(error.message, true);
      document.getElementById("test-summary").textContent = "运行失败";
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  document.getElementById("run-sample").addEventListener("click", () => run("sample"));
  document.getElementById("run-all").addEventListener("click", () => run("all"));

  document.getElementById("show-solution").addEventListener("click", async () => {
    const ok = await confirmDialog("查看参考答案？", "先自己尝试，实在卡住再看答案，学习效果会更好。", { okLabel: "查看答案" });
    if (!ok) return;
    try {
      const data = await api.solution(exercise.id);
      openModal({
        title: "参考答案",
        width: 720,
        body: `<div class="code-block" style="margin:0">
            <div class="code-head"><span class="code-dots"><i></i><i></i><i></i></span><span class="code-title">参考实现</span></div>
            <pre class="code-body"><code>${highlightPython(data.solution)}</code></pre>
          </div>
          ${data.analysis ? `<p class="small muted" style="margin:14px 0 0;line-height:1.8">${esc(data.analysis)}</p>` : ""}`,
        actions: [
          { label: "关闭", kind: "btn-ghost" },
          {
            label: "填入编辑器",
            kind: "btn-primary",
            close: false,
            onClick: ({ close }) => {
              editor.setValue(data.solution);
              close();
              toast("参考答案已填入编辑器", "success");
            },
          },
        ],
      });
    } catch (error) {
      toast(error.message, "error");
    }
  });
}
