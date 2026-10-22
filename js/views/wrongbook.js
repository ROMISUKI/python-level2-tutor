import { api } from "../api.js";
import { store, refreshData } from "../app.js";
import { icon, esc, toast, openModal, confirmDialog, highlightPython, emptyState } from "../ui.js";

export async function render(root, { query }) {
  if (query.auto === "1") {
    location.hash = "#/practice?mode=wrong&auto=1";
    return;
  }

  let data = await api.wrongbook();
  let filter = "all";

  function filtered() {
    if (filter === "due") return data.items.filter((item) => (item.nextReview || "9999") <= new Date().toISOString().slice(0, 10));
    if (filter === "hard") return data.items.filter((item) => item.state.wrong >= 2);
    return data.items;
  }

  function card(item) {
    const due = (item.nextReview || "9999") <= new Date().toISOString().slice(0, 10);
    return `<div class="wrong-card" data-qid="${esc(item.id)}">
      <div class="wrong-head">
        <div class="wrong-stem">${esc(item.stem)}</div>
        <div class="wrong-actions">
          <button class="btn btn-sm btn-soft" data-action="review">重做</button>
          <button class="btn btn-sm btn-ghost" data-action="master">已掌握</button>
        </div>
      </div>
      <div class="wrong-meta">
        <span class="badge badge-outline">${esc(item.chapterTitle)}</span>
        <span class="badge badge-red">错 ${item.state.wrong} 次</span>
        <span class="badge ${due ? "badge-amber" : ""}">${due ? "今日到期" : `下次复习 ${item.nextReview || "—"}`}</span>
        <span class="tiny muted">连续答对 2 次自动移出</span>
      </div>
    </div>`;
  }

  function paint() {
    const items = filtered();
    root.innerHTML = `<div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Mistakes</div>
          <h1 class="page-title">错题本</h1>
          <p class="page-sub">答错的题会自动收进这里。系统按 1 / 2 / 4 / 7 天的间隔安排复习，连续答对两次即可掌握。</p>
        </div>
        <div class="page-actions">
          <span class="badge badge-amber">${data.due} 道今日到期</span>
          <a class="btn btn-primary" href="#/practice?mode=wrong&auto=1">${icon("play", 15)} 开始复习</a>
        </div>
      </div>

      ${data.total === 0
        ? `<div class="card"><div class="card-body">${emptyState(
            "check",
            "错题本是空的",
            "练习时答错的题会自动出现在这里，并按遗忘曲线提醒你复习。",
            `<a class="btn btn-primary" href="#/practice?auto=1">去练习 10 道题</a>`
          )}</div></div>`
        : `<div class="card" style="margin-bottom:16px"><div class="card-body row" style="gap:18px;flex-wrap:wrap">
            <div><div class="stat-value">${data.total}</div><div class="stat-label">待掌握错题</div></div>
            <div><div class="stat-value" style="color:var(--amber)">${data.due}</div><div class="stat-label">今日到期</div></div>
            <div><div class="stat-value" style="color:var(--red)">${data.items.filter((i) => i.state.wrong >= 2).length}</div><div class="stat-label">反复出错</div></div>
            <div class="spacer"></div>
            <div class="filter-bar" style="margin:0">
              <button class="chip ${filter === "all" ? "active" : ""}" data-filter="all">全部</button>
              <button class="chip ${filter === "due" ? "active" : ""}" data-filter="due">今日到期</button>
              <button class="chip ${filter === "hard" ? "active" : ""}" data-filter="hard">高频错误</button>
            </div>
          </div></div>

          <div>${items.length ? items.map(card).join("") : emptyState("check", "这个筛选下没有错题", "换个筛选条件看看。")}</div>`
      }
    </div>`;

    root.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        filter = button.dataset.filter;
        paint();
      });
    });
    root.querySelectorAll('[data-action="review"]').forEach((button) => {
      button.addEventListener("click", () => {
        const cardEl = button.closest("[data-qid]");
        const item = data.items.find((entry) => entry.id === cardEl.dataset.qid);
        if (item) openQuestion(item);
      });
    });
    root.querySelectorAll('[data-action="master"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const cardEl = button.closest("[data-qid]");
        const item = data.items.find((entry) => entry.id === cardEl.dataset.qid);
        const ok = await confirmDialog("标记为已掌握？", `“${item.stem.slice(0, 40)}…” 将从错题本移除，之后仍可在统计中看到记录。`, { okLabel: "标记掌握" });
        if (!ok) return;
        await api.removeWrong(cardEl.dataset.qid);
        data = await api.wrongbook();
        paint();
        refreshData().catch(() => {});
        toast("已移出错题本", "success");
      });
    });
  }

  function openQuestion(item) {
    let answered = false;
    const modal = openModal({
      title: "错题重做",
      width: 640,
      body: `<div class="q-meta"><span class="badge badge-outline">${esc(item.chapterTitle)}</span><span class="badge badge-red">错 ${item.state.wrong} 次</span></div>
        <div class="q-stem" style="margin-top:8px">${esc(item.stem)}</div>
        ${item.code ? `<pre class="q-code">${highlightPython(item.code)}</pre>` : ""}
        <div class="options">
          ${item.options
            .map(
              (option, index) => `<button class="option" data-index="${index}">
                <span class="option-key">${"ABCD"[index]}</span><span class="option-text">${esc(option)}</span>
              </button>`
            )
            .join("")}
        </div>
        <div class="feedback-slot"></div>`,
    });
    modal.element.querySelectorAll(".option").forEach((button) => {
      button.addEventListener("click", async () => {
        if (answered) return;
        answered = true;
        const choice = Number(button.dataset.index);
        modal.element.querySelectorAll(".option").forEach((opt) => opt.classList.add("disabled"));
        try {
          const result = await api.answer(item.id, choice, 0, "wrongbook");
          modal.element.querySelectorAll(".option")[result.question.answer].classList.add("correct");
          if (!result.correct) button.classList.add("wrong");
          modal.element.querySelector(".feedback-slot").innerHTML = `<div class="feedback ${result.correct ? "ok" : "bad"}">
            <div class="feedback-head">${icon(result.correct ? "check" : "x", 16)} ${result.correct ? "答对了，再巩固一次就能移出" : "还是不对，看看解析"}</div>
            <div class="feedback-body">
              <p>正确答案：<strong>${"ABCD"[result.question.answer]}. ${esc(result.question.options[result.question.answer])}</strong></p>
              <p>${esc(result.question.explanation)}</p>
            </div>
          </div>`;
          data = await api.wrongbook();
          refreshData().catch(() => {});
          setTimeout(() => {
            if (modal.element.isConnected) {
              paint();
            }
          }, 900);
        } catch (error) {
          toast(error.message, "error");
        }
      });
    });
  }

  paint();
}
