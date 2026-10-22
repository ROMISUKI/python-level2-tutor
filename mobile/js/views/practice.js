import { api } from "../api.js";
import { onCleanup, store, refreshData } from "../app.js";
import { icon, esc, highlightPython, toast, emptyState } from "../ui.js";

const MODES = [
  { id: "chapter", title: "章节练习", desc: "按章节系统巩固，适合刚学完一课", icon: "book" },
  { id: "random", title: "随机练习", desc: "从全部题库随机抽题，检验综合水平", icon: "sparkles" },
  { id: "wrong", title: "错题重练", desc: "重做错题本中的题目，连续答对两次移出", icon: "alert" },
  { id: "bookmark", title: "收藏夹", desc: "复习你标记过的重点题目", icon: "bookmark" },
];

export async function render(root, { query }) {
  let session = null;
  let keyHandler = null;

  function cleanupSession() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  onCleanup(cleanupSession);

  function setupScreen(message = "") {
    cleanupSession();
    const stats = store.data.stats;
    const chaptersByModule = store.modules
      .map((module) => {
        const list = store.chapters.filter((c) => c.module === module.id);
        return `<optgroup label="${esc(module.name)}">${list
          .map((c) => `<option value="${c.id}">${esc(c.title)}</option>`)
          .join("")}</optgroup>`;
      })
      .join("");

    root.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Practice</div>
          <h1 class="page-title">题库练习</h1>
          <p class="page-sub">260 道选择题，覆盖 10 个 Python 章节和 3 个公共基础章节。每题都带解析，答错自动进入错题本。</p>
        </div>
        <div class="page-actions">
          <span class="badge badge-outline">题库覆盖 ${stats.coverage}%</span>
          <span class="badge badge-outline">正确率 ${stats.accuracy ?? "—"}%</span>
        </div>
      </div>
      ${message ? `<div class="callout warn" style="margin-bottom:16px"><div class="callout-icon">${icon("info", 18)}</div><div class="callout-body">${esc(message)}</div></div>` : ""}

      <div class="grid grid-4" style="margin-bottom:18px">
        ${MODES.map(
          (mode) => `<button class="card" data-mode="${mode.id}" style="text-align:left;padding:18px;border:1.5px solid var(--line);cursor:pointer;background:var(--surface)">
            <div class="stat-icon" style="margin-bottom:10px">${icon(mode.icon)}</div>
            <div class="strong" style="font-size:14px;margin-bottom:3px">${mode.title}</div>
            <div class="tiny muted" style="line-height:1.6">${mode.desc}</div>
          </button>`
        ).join("")}
      </div>

      <div class="card" style="max-width:760px">
        <div class="card-head"><h2 class="card-title">${icon("filter")} 练习设置</h2></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field">
              <label>练习模式</label>
              <select id="mode-select">
                ${MODES.map((m) => `<option value="${m.id}" ${m.id === "chapter" ? "selected" : ""}>${m.title}</option>`).join("")}
              </select>
            </div>
            <div class="field" id="chapter-field">
              <label>章节</label>
              <select id="chapter-select">${chaptersByModule}</select>
            </div>
            <div class="field">
              <label>难度</label>
              <select id="difficulty-select">
                <option value="all">全部难度</option>
                <option value="1">入门</option>
                <option value="2">进阶</option>
                <option value="3">挑战</option>
              </select>
            </div>
            <div class="field">
              <label>题目数量</label>
              <select id="limit-select">
                <option value="10">10 题 · 约 5 分钟</option>
                <option value="20" selected>20 题 · 约 10 分钟</option>
                <option value="30">30 题 · 约 15 分钟</option>
                <option value="50">50 题 · 约 25 分钟</option>
              </select>
            </div>
          </div>
          <div class="row" style="margin-top:18px;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div class="tiny muted">${stats.wrongCount} 道错题待掌握 · ${stats.dueReviews} 道今日到期</div>
            <button class="btn btn-primary btn-lg" id="start-practice">${icon("play", 16)} 开始练习</button>
          </div>
        </div>
      </div>
    </div>`;

    const modeSelect = document.getElementById("mode-select");
    const chapterField = document.getElementById("chapter-field");
    const syncMode = () => {
      chapterField.style.display = modeSelect.value === "chapter" ? "" : "none";
    };
    modeSelect.addEventListener("change", syncMode);
    syncMode();
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        modeSelect.value = button.dataset.mode;
        syncMode();
        document.getElementById("start-practice").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    if (query.chapter) {
      modeSelect.value = "chapter";
      syncMode();
      document.getElementById("chapter-select").value = query.chapter;
    }
    if (query.mode) {
      modeSelect.value = query.mode;
      syncMode();
    }
    document.getElementById("start-practice").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "正在组题…";
      try {
        const params = {
          mode: modeSelect.value,
          limit: document.getElementById("limit-select").value,
          difficulty: document.getElementById("difficulty-select").value,
        };
        if (modeSelect.value === "chapter") {
          params.chapter = document.getElementById("chapter-select").value;
          params.order = "random";
        }
        const data = await api.questions(params);
        if (!data.items.length) {
          setupScreen(
            modeSelect.value === "bookmark"
              ? "收藏夹还是空的，做题时点击书签按钮即可收藏。"
              : modeSelect.value === "wrong"
              ? "错题本是空的，先去练习吧。"
              : "这个条件下暂时没有题目，换一个章节或难度试试。"
          );
          return;
        }
        startSession(data.items, modeSelect.value);
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
        button.innerHTML = `${icon("play", 16)} 开始练习`;
      }
    });
  }

  function startSession(items, mode, local = false) {
    session = {
      items,
      mode,
      index: 0,
      answers: {},
      correctCount: 0,
      startedAt: Date.now(),
      questionStartedAt: Date.now(),
      local,
      wrongItems: [],
    };
    renderQuestion();
  }

  function sessionBar() {
    const done = Object.keys(session.answers).length;
    return `<div class="session-bar">
      <span class="badge badge-primary">${MODES.find((m) => m.id === session.mode)?.title || "练习"}</span>
      <div class="progress"><div class="progress-bar" style="width:${(done / session.items.length) * 100}%"></div></div>
      <span class="session-count">${done}/${session.items.length}</span>
      <span class="session-score">答对 <b>${session.correctCount}</b></span>
      <button class="btn btn-sm btn-ghost" id="quit-session">退出</button>
    </div>`;
  }

  function renderQuestion() {
    cleanupSession();
    const item = session.items[session.index];
    const answer = session.answers[item.id];
    const isAnswered = answer !== undefined;
    const selectedIndex = (session.selections || {})[item.id];
    const number = session.index + 1;

    root.innerHTML = `<div class="page q-layout no-anim">
      ${sessionBar()}
      <div class="q-card">
        <div class="q-meta">
          <span class="q-index">第 ${number} 题 / 共 ${session.items.length} 题</span>
          <span class="badge">${"★".repeat(item.difficulty || 1)}</span>
          ${item.publicBasic ? '<span class="badge badge-amber">公共基础</span>' : ""}
          <span class="spacer"></span>
          <button class="bookmark-btn ${item.state?.bookmarked ? "on" : ""}" id="bookmark" title="收藏本题">${icon("bookmark", 17)}</button>
        </div>
        <div class="q-stem">${esc(item.stem)}</div>
        ${item.code ? `<pre class="q-code">${highlightPython(item.code)}</pre>` : ""}
        <div class="options">
          ${item.options
            .map((option, index) => {
              let cls = "";
              if (isAnswered) {
                cls = "disabled";
                if (index === answer.correctIndex) cls += " correct";
                else if (index === answer.choice) cls += " wrong";
              } else if (selectedIndex === index) {
                cls = "selected";
              }
              return `<button class="option ${cls}" data-index="${index}" ${isAnswered ? "disabled" : ""}>
                <span class="option-key">${"ABCD"[index]}</span>
                <span class="option-text">${esc(option)}</span>
              </button>`;
            })
            .join("")}
        </div>
        <div id="feedback-slot">${isAnswered ? feedbackHtml(answer) : ""}</div>
        <div class="q-actions">
          <span class="tiny muted">快捷键：<kbd>A</kbd>–<kbd>D</kbd> 选择，<kbd>Enter</kbd> 提交 / 下一题</span>
          <span class="spacer"></span>
          ${
            isAnswered
              ? `<button class="btn btn-primary" id="next">${number === session.items.length ? "查看结果" : "下一题"} ${icon("arrowRight", 15)}</button>`
              : `<button class="btn btn-primary" id="submit" ${selectedIndex === undefined ? "disabled" : ""}>提交答案</button>`
          }
        </div>
      </div>
    </div>`;

    const optionButtons = [...root.querySelectorAll(".option")];
    optionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (session.answers[item.id] !== undefined) return;
        session.selections = session.selections || {};
        session.selections[item.id] = Number(button.dataset.index);
        optionButtons.forEach((b) => b.classList.toggle("selected", b === button));
        const submitButton = document.getElementById("submit");
        if (submitButton) submitButton.disabled = false;
      });
    });

    document.getElementById("bookmark")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const next = !button.classList.contains("on");
      try {
        await api.bookmark(item.id, next);
        button.classList.toggle("on", next);
        item.state = { ...(item.state || {}), bookmarked: next };
        toast(next ? "已加入收藏" : "已取消收藏");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    const submit = () => {
      if (session.answers[item.id] !== undefined) return;
      const choice = (session.selections || {})[item.id];
      if (choice === undefined) return;
      submitAnswer(item, choice);
    };
    document.getElementById("submit")?.addEventListener("click", submit);

    const next = () => {
      if (session.index < session.items.length - 1) {
        session.index += 1;
        session.questionStartedAt = Date.now();
        renderQuestion();
      } else {
        renderResult();
      }
    };
    document.getElementById("next")?.addEventListener("click", next);

    document.getElementById("quit-session")?.addEventListener("click", () => {
      if (Object.keys(session.answers).length === 0 || confirm("退出后本次练习记录会保留，确定退出吗？")) {
        session = null;
        setupScreen();
      }
    });

    keyHandler = (event) => {
      if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") return;
      const key = event.key.toUpperCase();
      if (!isAnswered && ["A", "B", "C", "D"].includes(key)) {
        const index = "ABCD".indexOf(key);
        if (index < item.options.length) {
          optionButtons[index]?.click();
        }
      } else if (event.key === "Enter") {
        if (isAnswered) next();
        else submit();
      }
    };
    document.addEventListener("keydown", keyHandler);
  }

  function feedbackHtml(answer) {
    const question = answer.question;
    return `<div class="feedback ${answer.correct ? "ok" : "bad"}">
      <div class="feedback-head">${icon(answer.correct ? "check" : "x", 16)}
        ${answer.correct ? "回答正确" : "回答错误，已加入错题本"}
        <span class="spacer"></span>
        <span class="tiny">正确答案 ${"ABCD"[question.answer]}</span>
      </div>
      <div class="feedback-body">
        <p>${esc(question.explanation)}</p>
        <p class="tiny muted" style="margin-bottom:0">${answer.correct ? (answer.state?.wrong > 0 ? "连续答对 2 次后，这道题会从错题本移出。" : "继续保持，注意同类题的边界条件。") : "复习建议：先看解析，再用自己的话复述一遍考点。"}</p>
      </div>
    </div>`;
  }

  async function submitAnswer(item, choice) {
    const duration = Date.now() - session.questionStartedAt;
    try {
      const result = await api.answer(item.id, choice, duration, "practice");
      session.answers[item.id] = {
        choice,
        correctIndex: result.question.answer,
        correct: result.correct,
        question: result.question,
        state: result.state,
      };
      if (result.correct) session.correctCount += 1;
      else session.wrongItems.push(item);
      item.state = result.state || item.state;
      renderQuestion();
      refreshData().catch(() => {});
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function renderResult() {
    cleanupSession();
    const total = session.items.length;
    const done = Object.keys(session.answers).length;
    const accuracy = done ? Math.round((session.correctCount / done) * 100) : 0;
    const wrongAnswers = Object.entries(session.answers)
      .filter(([, value]) => !value.correct)
      .map(([qid]) => session.items.find((item) => item.id === qid))
      .filter(Boolean);

    root.innerHTML = `<div class="page q-layout no-anim">
      <div class="result-hero">
        <div class="result-score">${accuracy}<span style="font-size:22px">%</span></div>
        <div class="result-label">本次练习正确率</div>
        <div class="result-stats">
          <div class="result-stat"><strong>${done}</strong><span>已作答</span></div>
          <div class="result-stat"><strong style="color:var(--green)">${session.correctCount}</strong><span>答对</span></div>
          <div class="result-stat"><strong style="color:var(--red)">${wrongAnswers.length}</strong><span>答错</span></div>
          <div class="result-stat"><strong>${Math.max(1, Math.round((Date.now() - session.startedAt) / 60000))}</strong><span>用时（分）</span></div>
        </div>
        <div class="row" style="justify-content:center;margin-top:22px;flex-wrap:wrap">
          ${wrongAnswers.length ? `<button class="btn btn-primary" id="retry-wrong">${icon("refresh", 15)} 只重做错题</button>` : ""}
          <button class="btn btn-ghost" id="again">${icon("sparkles", 15)} 再来一组</button>
          <a class="btn btn-ghost" href="#/wrongbook">查看错题本</a>
          <button class="btn btn-ghost" id="back-setup">返回题库</button>
        </div>
      </div>

      ${wrongAnswers.length
        ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2 class="card-title">${icon("alert")} 本次错题</h2></div>
            <div class="card-body">${wrongAnswers
              .map(
                (item) => `<div class="list-row">
                  <div class="grow"><div class="small" style="font-weight:600">${esc(item.stem)}</div>
                  <div class="tiny muted">正确答案：${"ABCD"[session.answers[item.id].correctIndex]}. ${esc(item.options[session.answers[item.id].correctIndex])}</div></div>
                  <span class="badge badge-red">错 1 次</span>
                </div>`
              )
              .join("")}</div></div>`
        : `<div class="card" style="margin-top:16px"><div class="card-body center" style="padding:28px">
            <div style="font-size:30px;margin-bottom:6px">🎉</div>
            <div class="strong">全部答对，状态很好</div>
            <div class="tiny muted">试着提高难度，或者去做一套模拟考试。</div>
          </div></div>`}
    </div>`;

    document.getElementById("again")?.addEventListener("click", () => {
      setupScreen();
    });
    document.getElementById("back-setup")?.addEventListener("click", () => setupScreen());
    document.getElementById("retry-wrong")?.addEventListener("click", () => {
      const items = wrongAnswers.map((item) => ({ ...item, state: { ...(item.state || {}), seen: 1 } }));
      startSession(items, "wrong", true);
    });
  }

  // initial
  if (query.auto === "1") {
    try {
      const mode = query.mode || (query.chapter ? "chapter" : "random");
      const params = { mode, limit: query.limit || "10" };
      if (mode === "chapter") params.chapter = query.chapter || store.chapters[0].id;
      const data = await api.questions(params);
      if (data.items.length) {
        startSession(data.items, mode);
        return;
      }
    } catch (error) {
      toast(error.message, "error");
    }
  }
  setupScreen();
}
