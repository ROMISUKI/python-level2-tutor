import { api } from "../api.js";
import { onCleanup, store, refreshData } from "../app.js";
import {
  icon,
  esc,
  toast,
  openModal,
  confirmDialog,
  highlightPython,
  formatDate,
  emptyState,
} from "../ui.js";

let activeSession = null;

function paperTitle(key) {
  return store.papers.find((paper) => paper.key === key)?.title || key;
}

export async function render(root, { parts }) {
  if (parts[0] === "session") {
    if (!activeSession) {
      location.hash = "#/exam";
      return;
    }
    renderSession(root);
    return;
  }
  if (parts[0] === "result" && parts[1]) {
    await renderResultPage(root, parts[1]);
    return;
  }
  renderList(root);
}

function renderList(root) {
  const stats = store.data.stats;
  const exams = stats.exams || [];

  root.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Mock Exam</div>
        <h1 class="page-title">模拟考试</h1>
        <p class="page-sub">按真实考试结构组卷：选择题 + 三道操作题，限时作答，交卷后自动判分并给出章节分析。</p>
      </div>
      <div class="page-actions">
        <span class="badge badge-outline">已完成 ${stats.totals.exams} 次</span>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:18px">
      ${store.papers
        .map(
          (paper, index) => `<div class="card" style="padding:22px">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div class="stat-icon ${index === 0 ? "" : "amber"}">${icon(index === 0 ? "clock" : "sparkles")}</div>
              <span class="badge ${index === 0 ? "badge-primary" : "badge-amber"}">${paper.duration} 分钟</span>
            </div>
            <h3 style="margin:14px 0 5px;font-size:19px">${esc(paper.title)}</h3>
            <p class="small muted" style="margin:0 0 14px;line-height:1.7">${esc(paper.description)}</p>
            <div class="row" style="gap:14px;font-size:12px;color:var(--muted);flex-wrap:wrap">
              <span>${icon("list", 13)} ${paper.choiceCount} 道选择题</span>
              <span>${icon("code", 13)} ${paper.codingLevels.length} 道操作题</span>
              <span>${icon("target", 13)} 60 分及格</span>
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:18px" data-start="${paper.key}">
              ${icon("play", 15)} 开始考试
            </button>
          </div>`
        )
        .join("")}
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("info")} 考试说明</h2></div>
        <div class="card-body">
          <div class="prose" style="font-size:13px;line-height:1.8">
            <ul style="margin:0;padding-left:20px">
              <li>选择题 40 分（公共基础 10 分 + Python 30 分），操作题 60 分。</li>
              <li>操作题按测试点自动判分，输出格式必须与题目要求完全一致。</li>
              <li>考试过程中可以运行自测检查程序，最终得分以交卷后的测试点结果为准。</li>
              <li>交卷后立即出分，并列出每道选择题的正确答案与解析。</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("trophy")} 考试记录</h2></div>
        <div class="card-body">
          ${exams.length
            ? exams
                .map(
                  (exam) => `<a class="list-row" href="#/exam/result/${exam.id}" style="cursor:pointer">
                    <div class="grow">
                      <div class="small strong">${esc(paperTitle(exam.blueprint))}</div>
                      <div class="tiny muted">${formatDate(exam.started_at, true)} · ${Math.round((exam.duration_sec || 0) / 60)} 分钟</div>
                    </div>
                    <span class="badge ${exam.score >= 60 ? "badge-green" : "badge-red"}">${exam.score} 分</span>
                    <span class="muted">›</span>
                  </a>`
                )
                .join("")
            : emptyState("clock", "还没有考试记录", "建议先完成章节学习，再用模拟卷检验水平。")}
        </div>
      </div>
    </div>
  </div>`;

  root.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", async () => {
      const paper = button.dataset.start;
      const key = store.papers.find((p) => p.key === paper);
      const ok = await confirmDialog(
        `开始「${key?.title || "模拟考试"}」？`,
        `考试限时 ${key?.duration || 120} 分钟。开始后计时立即启动，中途离开页面计时不会暂停。`,
        { okLabel: "开始考试" }
      );
      if (!ok) return;
      button.disabled = true;
      button.textContent = "正在组卷…";
      try {
        const data = await api.startExam(paper);
        activeSession = {
          ...data,
          answers: {},
          codes: {},
          flags: new Set(),
          index: 0,
          tab: "choice",
          taskIndex: 0,
          remaining: data.paper.duration * 60,
          elapsed: 0,
          startedAt: Date.now(),
          timer: null,
          submitted: false,
        };
        startTimer();
        location.hash = "#/exam/session";
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
        button.textContent = "开始考试";
      }
    });
  });
}

function startTimer() {
  if (!activeSession || activeSession.timer) return;
  activeSession.timer = setInterval(() => {
    if (!activeSession || activeSession.submitted) return;
    activeSession.remaining -= 1;
    activeSession.elapsed += 1;
    const timerEl = document.getElementById("exam-timer");
    if (timerEl) {
      timerEl.innerHTML = `${icon("clock", 16)} ${formatClock(activeSession.remaining)}`;
      timerEl.classList.toggle("warn", activeSession.remaining <= 600);
    }
    if (activeSession.remaining <= 0) {
      clearInterval(activeSession.timer);
      activeSession.timer = null;
      toast("考试时间到，正在自动交卷", "error");
      submitExam(true);
    }
  }, 1000);
}

function formatClock(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function renderSession(root) {
  const session = activeSession;
  const total = session.questions.length + session.tasks.length;
  const answeredCount = Object.keys(session.answers).length;
  const codingAnswered = Object.values(session.codes).filter((code) => code && code.trim()).length;

  root.innerHTML = `<div class="page no-anim">
    <div class="exam-topbar">
      <span class="badge badge-primary">${esc(session.paper.title)}</span>
      <span class="exam-title">${session.paper.totalChoice} 道选择 + ${session.tasks.length} 道操作</span>
      <span class="spacer"></span>
      <span class="tiny muted">已答 ${answeredCount + codingAnswered}/${total}</span>
      <span class="timer" id="exam-timer">${icon("clock", 16)} ${formatClock(session.remaining)}</span>
      <button class="btn btn-primary btn-sm" id="submit-exam">交卷</button>
    </div>

    <div class="exam-tabs">
      <button class="exam-tab ${session.tab === "choice" ? "active" : ""}" data-tab="choice">选择题</button>
      <button class="exam-tab ${session.tab === "coding" ? "active" : ""}" data-tab="coding">操作题</button>
    </div>

    <div id="exam-body"></div>
  </div>`;

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      session.tab = button.dataset.tab;
      renderSession(root);
    });
  });
  document.getElementById("submit-exam").addEventListener("click", () => submitExam(false));

  const body = document.getElementById("exam-body");
  if (session.tab === "choice") renderChoice(body, root);
  else renderCoding(body, root);
}

function renderChoice(body, root) {
  const session = activeSession;
  const question = session.questions[session.index];
  const chosen = session.answers[question.id];
  const number = session.index + 1;

  body.innerHTML = `<div class="exam-shell">
    <div class="q-card">
      <div class="q-meta">
        <span class="q-index">第 ${number} 题 / 共 ${session.questions.length} 题</span>
        ${question.publicBasic ? '<span class="badge badge-amber">公共基础</span>' : ""}
        <span class="badge badge-outline">${question.difficulty === 1 ? "入门" : question.difficulty === 2 ? "进阶" : "挑战"}</span>
        <span class="spacer"></span>
        <button class="bookmark-btn ${session.flags.has(question.id) ? "on" : ""}" id="flag-question" title="标记待检查">${icon("bookmark", 16)}</button>
      </div>
      <div class="q-stem">${esc(question.stem)}</div>
      ${question.code ? `<pre class="q-code">${highlightPython(question.code)}</pre>` : ""}
      <div class="options">
        ${question.options
          .map(
            (option, index) => `<button class="option ${chosen === index ? "selected" : ""}" data-index="${index}">
              <span class="option-key">${"ABCD"[index]}</span>
              <span class="option-text">${esc(option)}</span>
            </button>`
          )
          .join("")}
      </div>
      <div class="q-actions">
        <button class="btn btn-ghost" id="prev-q" ${session.index === 0 ? "disabled" : ""}>${icon("arrowLeft", 15)} 上一题</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="next-q">${session.index === session.questions.length - 1 ? "检查答题卡" : "下一题"} ${icon("arrowRight", 15)}</button>
      </div>
    </div>

    <aside class="palette">
      <h4>答题卡</h4>
      <div class="palette-grid">
        ${session.questions
          .map(
            (q, index) => `<button class="palette-btn ${session.answers[q.id] !== undefined ? "answered" : ""} ${index === session.index ? "current" : ""}" data-jump="${index}">${index + 1}</button>`
          )
          .join("")}
        ${session.tasks
          .map(
            (task, index) => `<button class="palette-btn coding ${session.codes[task.id]?.trim() ? "answered" : ""}" data-task="${index}" title="操作题">T${index + 1}</button>`
          )
          .join("")}
      </div>
      <div class="palette-legend">
        <span><span class="legend-dot" style="background:var(--primary)"></span>当前</span>
        <span><span class="legend-dot" style="background:var(--primary-soft);border:1px solid var(--primary)"></span>已答</span>
        <span><span class="legend-dot" style="background:var(--surface-3)"></span>未答</span>
      </div>
      <hr class="hr" style="margin:14px 0">
      <button class="btn btn-danger btn-block btn-sm" id="submit-exam-2">交卷并评分</button>
    </aside>
  </div>`;

  body.querySelectorAll(".option").forEach((button) => {
    button.addEventListener("click", () => {
      session.answers[question.id] = Number(button.dataset.index);
      body.querySelectorAll(".option").forEach((opt) => opt.classList.toggle("selected", opt === button));
      const palette = document.querySelector(`[data-jump="${session.index}"]`);
      if (palette) palette.classList.add("answered");
    });
  });
  document.getElementById("flag-question").addEventListener("click", (event) => {
    if (session.flags.has(question.id)) session.flags.delete(question.id);
    else session.flags.add(question.id);
    event.currentTarget.classList.toggle("on");
  });
  document.getElementById("prev-q").addEventListener("click", () => {
    if (session.index > 0) {
      session.index -= 1;
      renderSession(root);
    }
  });
  document.getElementById("next-q").addEventListener("click", () => {
    if (session.index < session.questions.length - 1) {
      session.index += 1;
      renderSession(root);
    } else {
      toast("答题卡上的蓝色题号表示已作答，可点击跳转检查");
    }
  });
  body.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      session.index = Number(button.dataset.jump);
      renderSession(root);
    });
  });
  body.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => {
      session.tab = "coding";
      session.taskIndex = Number(button.dataset.task);
      renderSession(root);
    });
  });
  document.getElementById("submit-exam-2").addEventListener("click", () => submitExam(false));
}

function renderCoding(body, root) {
  const session = activeSession;
  const task = session.tasks[session.taskIndex];
  if (!task) {
    body.innerHTML = `<div class="card"><div class="card-body">${emptyState("code", "本次考试没有操作题", "")}</div></div>`;
    return;
  }

  body.innerHTML = `<div class="exam-task-layout">
    <section class="problem-card" style="position:static;max-height:none">
      <div class="row" style="gap:7px;flex-wrap:wrap">
        <span class="badge badge-primary">操作题 ${session.taskIndex + 1}</span>
        <span class="badge badge-outline">${task.points} 分</span>
        <span class="badge">${task.level === "basic" ? "基本操作" : task.level === "simple" ? "简单应用" : "综合应用"}</span>
      </div>
      <h2>${esc(task.title)}</h2>
      <p>${esc(task.statement)}</p>
      <h4>输入格式</h4>
      <div class="spec-box">${esc(task.inputSpec)}</div>
      <h4>输出格式</h4>
      <div class="spec-box">${esc(task.outputSpec)}</div>
      ${task.samples?.[0]
        ? `<h4>样例</h4><div class="sample-box"><div class="sample-body">
            <div><div class="sample-label">输入</div><pre>${esc(task.samples[0].stdin || "（无需输入）")}</pre></div>
            <div><div class="sample-label">输出</div><pre>${esc(task.samples[0].stdout)}</pre></div>
          </div></div>`
        : ""}
      <div class="row" style="gap:6px;margin-top:14px">
        ${session.tasks.map((t, i) => `<button class="chip ${i === session.taskIndex ? "active" : ""}" data-switch-task="${i}">第 ${i + 1} 题</button>`).join("")}
      </div>
    </section>

    <section class="editor-col" style="position:static">
      <div class="editor-shell">
        <div class="editor-bar"><span class="dot"></span><span class="filename">${esc(task.id)}.py</span><span class="spacer"></span><span class="tiny muted">Ctrl+Enter 自测</span></div>
        <textarea id="exam-editor"></textarea>
      </div>
      <div class="run-bar">
        <button class="btn btn-primary" id="exam-run">${icon("play", 15)} 运行自测</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost" id="exam-submit-task">交卷</button>
      </div>
      <div class="test-panel">
        <div class="test-panel-head">${icon("terminal", 15)} 自测结果 <span class="spacer"></span><span class="tiny muted" id="test-summary">尚未运行</span></div>
        <div class="test-list" id="test-list"><div class="test-row"><span class="muted small">运行自测只用于检查程序，不影响最终评分。</span></div></div>
      </div>
    </section>
  </div>`;

  const editor = CodeMirror.fromTextArea(document.getElementById("exam-editor"), {
    mode: "python",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    lineWrapping: true,
    extraKeys: { Tab: (cm) => cm.replaceSelection("    ") },
  });
  editor.setValue(session.codes[task.id] || task.starter || "# 请在此处编写代码\n");
  editor.on("change", () => {
    session.codes[task.id] = editor.getValue();
  });
  onCleanup(() => editor.getWrapperElement().remove());

  body.querySelectorAll("[data-switch-task]").forEach((button) => {
    button.addEventListener("click", () => {
      session.codes[task.id] = editor.getValue();
      session.taskIndex = Number(button.dataset.switchTask);
      renderSession(root);
    });
  });

  document.getElementById("exam-run").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "运行中…";
    try {
      const code = editor.getValue();
      session.codes[task.id] = code;
      const result = await api.runExercise(task.id, code, "all");
      document.getElementById("test-summary").textContent = `${result.passed}/${result.total} 通过`;
      document.getElementById("test-list").innerHTML = result.results
        .map(
          (test) => `<div class="test-row">
            <span class="test-icon ${test.passed ? "test-pass" : "test-fail"}">${test.passed ? "✓" : "×"}</span>
            <div class="grow"><div class="test-name">${esc(test.name)}</div>
            ${test.passed ? "" : `<div class="test-detail">${esc((test.stderr || `期望：${test.expected.trim()}\n实际：${test.actual.trim()}`).slice(0, 400))}</div>`}</div>
          </div>`
        )
        .join("");
      toast(result.passed === result.total ? "全部测试点通过" : `${result.passed}/${result.total} 通过`, result.passed === result.total ? "success" : "");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon("play", 15)} 运行自测`;
    }
  });
  document.getElementById("exam-submit-task").addEventListener("click", () => submitExam(false));
}

async function submitExam(auto) {
  const session = activeSession;
  if (!session || session.submitted) return;
  if (!auto) {
    const unanswered = session.questions.length - Object.keys(session.answers).length;
    const codingBlank = session.tasks.filter((task) => !session.codes[task.id]?.trim()).length;
    const ok = await confirmDialog(
      "确认交卷？",
      `还有 ${unanswered} 道选择题未作答，${codingBlank} 道操作题未编写代码。交卷后不能修改。`,
      { okLabel: "确认交卷" }
    );
    if (!ok) return;
  }
  session.submitted = true;
  if (session.timer) {
    clearInterval(session.timer);
    session.timer = null;
  }
  const duration = Math.round((Date.now() - session.startedAt) / 1000);
  const onExamPage = location.hash.startsWith("#/exam/session");
  const root = document.getElementById("view");
  if (onExamPage) {
    root.innerHTML = `<div class="page no-anim"><div class="card"><div class="card-body center" style="padding:60px">
      <div class="result-label">正在判分</div>
      <div class="strong" style="font-size:18px;margin-top:8px">选择题已统计，操作题正在运行测试点…</div>
      <div class="tiny muted" style="margin-top:8px">这通常只需要几秒钟</div>
    </div></div></div>`;
  }
  try {
    const result = await api.submitExam(session.sessionId, session.answers, session.codes, duration);
    activeSession = null;
    await refreshData();
    if (onExamPage) {
      await showResult(root, result);
    } else {
      toast(`考试已自动交卷，得分 ${result.score} 分`, "success");
    }
  } catch (error) {
    session.submitted = false;
    toast(error.message, "error");
    if (onExamPage) renderSession(root);
  }
}

async function renderResultPage(root, examId) {
  try {
    const result = await api.examResult(examId);
    const payload = { score: result.score, detail: result.detail, sessionId: examId };
    await showResult(root, payload);
  } catch (error) {
    root.innerHTML = `<div class="page"><div class="card"><div class="card-body"><h2>成绩不存在</h2><p class="muted">${esc(error.message)}</p><a class="btn btn-primary" href="#/exam">返回模拟考试</a></div></div></div>`;
  }
}

async function showResult(root, result) {
  const detail = result.detail;
  const score = Math.round(result.score * 10) / 10;
  const passed = score >= (detail.passScore || 60);
  const choiceDone = detail.choice.items.filter((item) => item.chosen !== null && item.chosen !== undefined).length;
  const codingDone = detail.coding.items.filter((item) => !item.unanswered).length;

  root.innerHTML = `<div class="page no-anim">
    <div class="result-hero">
      <div class="result-score">${score}<span style="font-size:22px">分</span></div>
      <div class="result-label">${esc(detail.paperTitle)}</div>
      <div class="row" style="justify-content:center;margin-top:12px">
        <span class="badge ${passed ? "badge-green" : "badge-red"}">${passed ? "达到及格线" : "未达到及格线"}</span>
        <span class="badge badge-outline">用时 ${Math.round((detail.durationSec || 0) / 60)} 分钟</span>
      </div>
      <div class="exam-result-grid">
        <div class="mini-stat"><strong>${detail.choice.score}<span class="tiny muted">/${detail.choice.maxScore}</span></strong><span>选择题</span></div>
        <div class="mini-stat"><strong>${detail.coding.score}<span class="tiny muted">/${detail.coding.maxScore}</span></strong><span>操作题</span></div>
        <div class="mini-stat"><strong>${choiceDone}/${detail.choice.total}</strong><span>选择题作答</span></div>
        <div class="mini-stat"><strong>${codingDone}/${detail.coding.items.length}</strong><span>操作题完成</span></div>
      </div>
      <div class="row" style="justify-content:center;flex-wrap:wrap">
        <a class="btn btn-primary" href="#/wrongbook">${icon("alert", 15)} 查看错题本</a>
        <a class="btn btn-ghost" href="#/exam">再考一次</a>
        <a class="btn btn-ghost" href="#/stats">学习统计</a>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("chart")} 章节表现</h2></div>
        <div class="card-body">
          ${detail.byChapter
            .map(
              (chapter) => `<div class="bar-row">
                <div class="bar-label">${esc(chapter.title)}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(chapter.correct / Math.max(1, chapter.total)) * 100}%"></div></div>
                <div class="bar-val">${chapter.correct}/${chapter.total}</div>
              </div>`
            )
            .join("")}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("code")} 操作题得分</h2></div>
        <div class="card-body">
          ${detail.coding.items
            .map(
              (item) => `<div class="list-row">
                <div class="grow">
                  <div class="small strong">${esc(item.title)}</div>
                  <div class="tiny muted">${item.unanswered ? "未作答" : `${item.passed}/${item.total} 个测试点通过`} · 满分 ${item.points}</div>
                </div>
                <span class="badge ${item.awarded === item.points ? "badge-green" : item.awarded ? "badge-amber" : "badge-red"}">${item.awarded} 分</span>
              </div>`
            )
            .join("")}
          <hr class="hr">
          <div class="tiny muted">操作题由浏览器内的 Python 运行时评分，输出格式差异会直接影响得分。</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2 class="card-title">${icon("list")} 选择题逐题解析</h2>
        <span class="tiny muted">答对 ${detail.choice.correct}/${detail.choice.total}</span>
      </div>
      <div class="card-body">
        ${detail.choice.items
          .map(
            (item, index) => `<div class="review-item ${item.correct ? "ok" : "bad"}">
              <div class="row" style="align-items:flex-start;gap:8px">
                <span class="tiny muted">${index + 1}</span>
                <div class="grow"><div class="review-stem">${esc(item.stem)}</div>
                <div class="review-ans">
                  你的答案：<b class="${item.correct ? "ok" : "bad"}">${item.chosen === null || item.chosen === undefined ? "未作答" : `${"ABCD"[item.chosen]}. ${esc(item.options[item.chosen])}`}</b>
                  ${item.correct ? "" : ` · 正确答案：<b class="ok">${"ABCD"[item.answer]}. ${esc(item.options[item.answer])}</b>`}
                </div>
                ${item.correct ? "" : `<div class="tiny muted" style="margin-top:6px;line-height:1.7">${esc(item.explanation)}</div>`}
                </div>
              </div>
            </div>`
          )
          .join("")}
      </div>
    </div>
  </div>`;
}
