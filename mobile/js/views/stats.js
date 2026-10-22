import { store } from "../app.js";
import { icon, esc, formatDuration, formatDate, formatNumber } from "../ui.js";

function heatmap(activity) {
  const level = (answered) => {
    if (!answered) return 0;
    if (answered <= 5) return 1;
    if (answered <= 15) return 2;
    if (answered <= 30) return 3;
    return 4;
  };
  const activeDays = activity.filter((day) => day.answered > 0 || day.seconds > 0).length;
  const answered = activity.reduce((sum, day) => sum + day.answered, 0);
  const seconds = activity.reduce((sum, day) => sum + day.seconds, 0);
  return `<div class="heatmap">
    ${activity
      .map(
        (day) => `<div class="heat-cell" data-level="${level(day.answered)}" title="${day.day} · ${day.answered} 题 · ${formatDuration(day.seconds)}"></div>`
      )
      .join("")}
  </div>
  <div class="heat-legend"><span>少</span><i style="background:var(--surface-3)"></i><i style="background:color-mix(in srgb, var(--primary) 25%, var(--surface-3))"></i><i style="background:color-mix(in srgb, var(--primary) 50%, var(--surface-3))"></i><i style="background:color-mix(in srgb, var(--primary) 75%, var(--surface-3))"></i><i style="background:var(--primary)"></i><span>多</span></div>
  <div class="row" style="margin-top:16px;gap:22px;flex-wrap:wrap">
    <div><div class="strong" style="font-size:17px">${activeDays}</div><div class="tiny muted">活跃天数</div></div>
    <div><div class="strong" style="font-size:17px">${formatNumber(answered)}</div><div class="tiny muted">近 30 天答题</div></div>
    <div><div class="strong" style="font-size:17px">${formatDuration(seconds)}</div><div class="tiny muted">近 30 天学习</div></div>
    <div><div class="strong" style="font-size:17px">${Math.round(answered / 30)}</div><div class="tiny muted">日均答题</div></div>
  </div>`;
}

function radar(modules) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = 96;
  const count = modules.length;
  const angle = (i) => (Math.PI * 2 * i) / count - Math.PI / 2;
  const point = (i, value) => {
    const r = (Math.max(0, Math.min(100, value || 0)) / 100) * radius;
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  };
  const polygon = (values) =>
    values.map((value, i) => point(i, value).map((n) => n.toFixed(1)).join(",")).join(" ");
  const rings = [25, 50, 75, 100]
    .map((value) => {
      const pts = modules.map((_, i) => point(i, value).map((n) => n.toFixed(1)).join(",")).join(" ");
      return `<polygon points="${pts}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
    })
    .join("");
  const axes = modules
    .map((_, i) => {
      const [x, y] = point(i, 100);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
    })
    .join("");
  const labels = modules
    .map((module, i) => {
      const [x, y] = point(i, 118);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="10.5" fill="var(--muted)">${esc(module.name)}</text>`;
    })
    .join("");
  const accuracy = polygon(modules.map((m) => m.accuracy ?? 0));
  const coverage = polygon(modules.map((m) => m.coverage ?? 0));

  return `<div class="radar-wrap">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="模块掌握雷达图">
      ${rings}${axes}
      <polygon points="${coverage}" fill="color-mix(in srgb, var(--primary-2) 12%, transparent)" stroke="var(--primary-2)" stroke-width="1.6" stroke-dasharray="4 3"/>
      <polygon points="${accuracy}" fill="color-mix(in srgb, var(--primary) 16%, transparent)" stroke="var(--primary)" stroke-width="2"/>
      ${modules
        .map((m, i) => {
          const [x, y] = point(i, m.accuracy ?? 0);
          return `<circle cx="${x}" cy="${y}" r="3" fill="var(--primary)"/>`;
        })
        .join("")}
      ${labels}
    </svg>
  </div>
  <div class="radar-legend">
    <span><span class="legend-dot" style="background:var(--primary)"></span>正确率</span>
    <span><span class="legend-dot" style="background:var(--primary-2)"></span>题库覆盖</span>
  </div>`;
}

function achievements(stats, chapters) {
  const readCount = chapters.filter((c) => c.progress?.read_at).length;
  const list = [
    { icon: "🌱", title: "迈出第一步", desc: "累计答题 10 道", done: stats.totals.answered >= 10 },
    { icon: "📚", title: "百题斩", desc: "累计答题 100 道", done: stats.totals.answered >= 100 },
    { icon: "🎯", title: "神枪手", desc: "答题 50 道且正确率 ≥ 85%", done: stats.totals.answered >= 50 && (stats.accuracy || 0) >= 85 },
    { icon: "🔥", title: "坚持一周", desc: "连续学习 7 天", done: stats.streak >= 7 },
    { icon: "💻", title: "代码手感", desc: "通过 10 道代码题", done: stats.exercises.solved >= 10 },
    { icon: "🏆", title: "模拟及格", desc: "模拟考试达到 60 分", done: (stats.exams || []).some((e) => (e.score || 0) >= 60) },
    { icon: "🧭", title: "通读大纲", desc: "读完 13 个章节", done: readCount >= chapters.length },
    { icon: "🗂️", title: "错题清零", desc: "错题本中没有待掌握题目", done: stats.wrongCount === 0 && stats.totals.answered > 0 },
  ];
  return `<div class="grid grid-2" style="gap:10px">${list
    .map(
      (item) => `<div class="achv ${item.done ? "" : "locked"}">
        <div class="achv-icon">${item.icon}</div>
        <div class="achv-body">
          <strong>${item.title}</strong>
          <span>${item.desc}</span>
          <span class="badge ${item.done ? "badge-green" : "badge-outline"}">${item.done ? "已达成" : "未达成"}</span>
        </div>
      </div>`
    )
    .join("")}</div>`;
}

export async function render(root) {
  const stats = store.data.stats;
  const chapters = store.chapters;
  const answeredChapters = stats.byChapter.filter((c) => c.answered > 0);
  const maxAnswered = Math.max(1, ...stats.byChapter.map((c) => c.answered));
  const studyDays = stats.activity.filter((d) => d.answered > 0 || d.seconds > 0).length;

  root.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Analytics</div>
        <h1 class="page-title">学习统计</h1>
        <p class="page-sub">用数据看清自己的复习状态：正确率、题库覆盖、章节强弱和每日节奏。</p>
      </div>
      <div class="page-actions">
        <span class="badge badge-outline">已学习 ${studyDays} 天</span>
        <span class="badge badge-outline">累计 ${formatDuration(stats.totals.studySeconds)}</span>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="stat"><div class="stat-icon">${icon("layers")}</div><div><div class="stat-value">${formatNumber(stats.totals.answered)}</div><div class="stat-label">累计答题</div><div class="stat-sub">覆盖 ${stats.coverage}% 题库</div></div></div>
      <div class="stat"><div class="stat-icon green">${icon("target")}</div><div><div class="stat-value">${stats.accuracy ?? "—"}%</div><div class="stat-label">总正确率</div><div class="stat-sub">答对 ${formatNumber(stats.totals.correct)} 题</div></div></div>
      <div class="stat"><div class="stat-icon amber">${icon("flame")}</div><div><div class="stat-value">${stats.streak} 天</div><div class="stat-label">连续学习</div><div class="stat-sub">最长坚持就是优势</div></div></div>
      <div class="stat"><div class="stat-icon red">${icon("alert")}</div><div><div class="stat-value">${stats.wrongCount}</div><div class="stat-label">待掌握错题</div><div class="stat-sub">今日到期 ${stats.dueReviews} 题</div></div></div>
    </div>

    <div class="grid grid-2" style="margin-bottom:18px">
      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("chart")} 最近 30 天</h2><span class="tiny muted">颜色越深，练习越多</span></div>
        <div class="card-body">${heatmap(stats.activity)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("target")} 模块掌握</h2><span class="tiny muted">实线为正确率</span></div>
        <div class="card-body">${radar(stats.modules)}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:18px">
      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("list")} 章节正确率</h2><span class="tiny muted">按课程顺序</span></div>
        <div class="card-body">
          ${stats.byChapter
            .map(
              (chapter) => `<div class="bar-row" title="${esc(chapter.title)}">
                <div class="bar-label">${esc(chapter.title)}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${chapter.accuracy ?? 0}%;opacity:${chapter.answered ? 1 : .28}"></div></div>
                <div class="bar-val">${chapter.accuracy === null ? "—" : `${chapter.accuracy}%`}</div>
              </div>`
            )
            .join("")}
          <div class="tiny muted" style="margin-top:10px">一共有 ${answeredChapters.length} 个章节留下了练习记录。</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("award")} 成就</h2><span class="tiny muted">一点点积累</span></div>
        <div class="card-body">${achievements(stats, chapters)}</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("clock")} 最近考试</h2><a class="card-link" href="#/exam">去考试 →</a></div>
        <div class="card-body">
          ${stats.exams.length
            ? stats.exams
                .map(
                  (exam) => `<a class="list-row" href="#/exam/result/${exam.id}">
                    <div class="grow"><div class="small strong">${esc(store.papers.find((p) => p.key === exam.blueprint)?.title || exam.blueprint)}</div>
                    <div class="tiny muted">${formatDate(exam.started_at, true)}</div></div>
                    <span class="badge ${exam.score >= 60 ? "badge-green" : "badge-red"}">${exam.score} 分</span>
                  </a>`
                )
                .join("")
            : `<div class="muted small">还没有考试记录，建议完成一轮复习后做一套模拟卷。</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="card-title">${icon("bulb")} 下一步建议</h2></div>
        <div class="card-body">
          ${stats.weakChapters.length
            ? `<div class="stack" style="gap:10px">${stats.weakChapters
                .slice(0, 3)
                .map(
                  (chapter, index) => `<div class="list-row" style="border:0;padding:0">
                    <span class="badge ${index === 0 ? "badge-red" : "badge-amber"}">${index + 1}</span>
                    <div class="grow"><div class="small strong">${esc(chapter.title)}</div><div class="tiny muted">正确率 ${chapter.accuracy}% · 已作答 ${chapter.answered} 次</div></div>
                    <a class="btn btn-sm btn-ghost" href="#/chapter/${chapter.cid}">重读</a>
                  </div>`
                )
                .join("")}</div>`
            : `<p class="small muted" style="margin:0">目前没有明显短板。可以尝试提高练习难度，或做一套完整模拟卷检验综合能力。</p>`}
          <hr class="hr">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <a class="btn btn-soft btn-sm" href="#/practice?auto=1">刷 10 题</a>
            <a class="btn btn-ghost btn-sm" href="#/wrongbook">复习错题</a>
            <a class="btn btn-ghost btn-sm" href="#/code">练代码</a>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
