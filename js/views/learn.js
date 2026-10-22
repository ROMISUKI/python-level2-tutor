import { store } from "../app.js";
import { icon, esc } from "../ui.js";

export async function render(root, { parts, query }) {
  const moduleId = query.module || "all";
  const chapters = store.chapters;
  const statsByChapter = Object.fromEntries((store.data.stats.byChapter || []).map((c) => [c.cid, c]));
  const modules = store.modules.filter((m) => chapters.some((c) => c.module === m.id));

  const list = moduleId === "all" ? chapters : chapters.filter((c) => c.module === moduleId);

  root.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Curriculum</div>
        <h1 class="page-title">课程学习</h1>
        <p class="page-sub">13 个章节覆盖考试大纲：Python 语法、流程控制、函数与容器、文件与计算生态，以及 10 分公共基础知识。</p>
      </div>
      <div class="page-actions">
        <span class="badge badge-outline">${chapters.filter((c) => c.progress?.read_at).length}/${chapters.length} 章已读</span>
      </div>
    </div>

    <div class="module-row">
      <a class="module-chip ${moduleId === "all" ? "active" : ""}" href="#/learn">全部章节</a>
      ${modules
        .map(
          (m) => `<a class="module-chip ${moduleId === m.id ? "active" : ""}" href="#/learn?module=${m.id}">
            <span class="module-dot" style="background:${m.color}"></span>${esc(m.name)}
          </a>`
        )
        .join("")}
    </div>

    <div class="chapter-grid">
      ${list
        .map((chapter, index) => {
          const stat = statsByChapter[chapter.id] || {};
          const accuracy = stat.accuracy;
          const seen = chapter.questionSeen || 0;
          const total = chapter.questionCount || 1;
          const read = Boolean(chapter.progress?.read_at);
          const module = store.modules.find((m) => m.id === chapter.module);
          return `<a class="chapter-card" href="#/chapter/${chapter.id}">
            <div class="chapter-card-top">
              <span class="chapter-num">第 ${String(chapter.order).padStart(2, "0")} 章</span>
              <span class="badge" style="color:${module?.color || "var(--primary)"};background:color-mix(in srgb, ${module?.color || "var(--primary)"} 12%, transparent)">${esc(chapter.moduleName)}</span>
            </div>
            <h3>${esc(chapter.title)}</h3>
            <p>${esc(chapter.subtitle)}</p>
            <div class="chapter-meta">
              <span>${icon("clock", 13)} ${chapter.minutes} 分钟</span>
              <span>${icon("list", 13)} ${chapter.questionCount} 题</span>
              <span>${icon("layers", 13)} ${chapter.sections} 节</span>
            </div>
            <div class="chapter-foot">
              <div class="progress progress-sm"><div class="progress-bar" style="width:${Math.round((seen / total) * 100)}%"></div></div>
              <span class="tiny muted">${seen}/${total}</span>
              ${read ? `<span class="chapter-read">${icon("check", 12)} 已读</span>` : accuracy !== null && accuracy !== undefined ? `<span class="badge badge-outline">${accuracy}%</span>` : ""}
            </div>
          </a>`;
        })
        .join("")}
    </div>

    <div class="card" style="margin-top:18px">
      <div class="card-body row" style="gap:16px;flex-wrap:wrap">
        <div class="stat-icon">${icon("bulb")}</div>
        <div class="grow">
          <div class="strong small">学习顺序建议</div>
          <div class="tiny muted">零基础按章节顺序学习；有基础可直接跳到最后三章公共基础，再用模拟考试定位薄弱点。</div>
        </div>
        <a class="btn btn-soft" href="#/exam">去做一套模拟卷 ${icon("arrowRight", 15)}</a>
      </div>
    </div>
  </div>`;
}
