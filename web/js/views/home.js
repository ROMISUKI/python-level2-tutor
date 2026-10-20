import { store } from "../app.js";
import { icon, esc, ring, formatNumber, formatDuration } from "../ui.js";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function activityMini(activity) {
  const days = activity.slice(-14);
  const max = Math.max(1, ...days.map((d) => d.answered));
  return `<div style="display:flex;align-items:flex-end;gap:5px;height:66px;margin-top:14px">
    ${days
      .map((d) => {
        const h = Math.max(5, Math.round((d.answered / max) * 100));
        const color = d.answered ? "var(--primary)" : "var(--surface-3)";
        return `<div title="${d.day} · ${d.answered} 题" style="flex:1;height:${h}%;min-height:4px;border-radius:4px;background:${color};opacity:${d.answered ? 0.35 + 0.65 * (d.answered / max) : 1}"></div>`;
      })
      .join("")}
  </div>
  <div class="row tiny muted" style="justify-content:space-between;margin-top:6px">
    <span>${days[0]?.day.slice(5) || ""}</span><span>最近 14 天</span><span>今天</span>
  </div>`;
}

export async function render(root) {
  const stats = store.data.stats;
  const plan = store.data.plan;
  const chapters = store.chapters;
  const nickname = store.settings.nickname?.trim();
  const daysLeft = stats.daysLeft;
  const readCount = chapters.filter((c) => c.progress?.read_at).length;

  const unread = chapters.find((c) => !c.progress?.read_at);
  const weak = stats.weakChapters?.[0];
  const continueChapter = weak || unread || chapters[0];
  const continueLabel = weak ? "补强薄弱章节" : unread ? "继续学习" : "复习第一章";

  const countdown =
    daysLeft === null || daysLeft === undefined
      ? `<span class="badge badge-outline">未设置考试日期</span>`
      : daysLeft >= 0
      ? `距离考试还有 <strong style="color:var(--text)">${daysLeft}</strong> 天`
      : `考试日期已过 <strong style="color:var(--text)">${-daysLeft}</strong> 天`;

  const statCards = [
    { icon: "layers", tone: "", value: formatNumber(stats.totals.answered), label: "累计答题", sub: `覆盖 ${stats.coverage}% 题库` },
    { icon: "target", tone: "green", value: stats.accuracy === null ? "—" : `${stats.accuracy}%`, label: "总正确率", sub: `答对 ${formatNumber(stats.totals.correct)} 题` },
    { icon: "flame", tone: "amber", value: `${stats.streak} 天`, label: "连续学习", sub: `今日已学 ${formatDuration(stats.today.seconds)}` },
    { icon: "alert", tone: "red", value: formatNumber(stats.wrongCount), label: "错题待掌握", sub: `${stats.dueReviews} 题今天到期` },
  ];

  root.innerHTML = `
  <div class="page">
    <section class="hero">
      <div>
        <span class="hero-kicker">${icon("sparkles", 13)} NCRE 二级 Python</span>
        <h1>${greeting()}${nickname ? `，${esc(nickname)}` : ""}<br>今天也向 <em>二级证书</em> 靠近一点</h1>
        <p>${countdown} · 已读完 ${readCount}/${chapters.length} 章 · 题库覆盖 ${stats.coverage}%</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/chapter/${continueChapter.id}">
            ${icon("play", 16)} ${continueLabel}
          </a>
          <a class="btn btn-ghost btn-lg" href="#/practice?auto=1">${icon("list", 16)} 刷 10 道题</a>
          <a class="btn btn-ghost btn-lg" href="#/exam">${icon("clock", 16)} 模拟考试</a>
        </div>
      </div>
      <div class="hero-side">
        ${ring(stats.coverage, 132)}
        <div class="row" style="gap:6px;margin-top:2px">
          <span class="badge badge-primary">${readCount} 章已读</span>
          <span class="badge">${formatNumber(stats.totals.exercisesSolved)}/${stats.exercises.total} 代码题</span>
        </div>
      </div>
    </section>

    <div class="grid grid-4" style="margin-bottom:18px">
      ${statCards
        .map(
          (s) => `<div class="stat">
            <div class="stat-icon ${s.tone}">${icon(s.icon)}</div>
            <div class="grow">
              <div class="stat-value">${s.value}</div>
              <div class="stat-label">${s.label}</div>
              <div class="stat-sub">${s.sub}</div>
            </div>
          </div>`
        )
        .join("")}
    </div>

    <div class="grid grid-2" style="margin-bottom:18px">
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${icon("target")} 今日计划</h2>
          <span class="badge badge-primary">${plan.answeredToday}/${plan.goal} 题</span>
        </div>
        <div class="card-body">
          <div class="progress" style="margin-bottom:14px"><div class="progress-bar" style="width:${Math.min(100, (plan.answeredToday / Math.max(1, plan.goal)) * 100)}%"></div></div>
          ${plan.actions.length
            ? plan.actions
                .map(
                  (action) => `<a class="plan-item" href="${
                    action.action === "wrongbook"
                      ? "#/wrongbook?auto=1"
                      : action.action === "practice"
                      ? "#/practice?auto=1"
                      : `#/chapter/${action.chapterId}`
                  }">
                    <span class="plan-dot"></span>
                    <span class="grow"><span class="plan-title">${esc(action.title)}</span><br><span class="plan-desc">${esc(action.desc)}</span></span>
                    <span class="plan-arrow">›</span>
                  </a>`
                )
                .join("")
            : `<div class="muted small">今天的任务都完成了，保持节奏，明天继续。</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${icon("chart")} 学习节奏</h2>
          <a class="card-link" href="#/stats">查看统计 →</a>
        </div>
        <div class="card-body">
          ${activityMini(stats.activity)}
          <div class="row" style="margin-top:16px;gap:22px">
            <div><div class="strong" style="font-size:17px">${formatNumber(stats.totals.answered)}</div><div class="tiny muted">累计答题</div></div>
            <div><div class="strong" style="font-size:17px">${stats.accuracy ?? "—"}%</div><div class="tiny muted">正确率</div></div>
            <div><div class="strong" style="font-size:17px">${formatDuration(stats.totals.studySeconds)}</div><div class="tiny muted">累计学习</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${icon("alert")} 需要补强</h2>
          <a class="card-link" href="#/learn">全部课程 →</a>
        </div>
        <div class="card-body">
          ${stats.weakChapters.length
            ? stats.weakChapters
                .map(
                  (c) => `<div class="list-row">
                    <div class="grow">
                      <div class="ellipsis" style="font-size:13px;font-weight:650">${esc(c.title)}</div>
                      <div class="tiny muted">${c.answered} 次作答 · 正确率 ${c.accuracy}%</div>
                    </div>
                    <div style="width:86px"><div class="progress progress-sm"><div class="progress-bar" style="width:${c.accuracy}%;background:var(--amber)"></div></div></div>
                    <a class="btn btn-sm btn-ghost" href="#/chapter/${c.cid}">复习</a>
                  </div>`
                )
                .join("")
            : `<div class="row" style="gap:10px;padding:10px 0">
                <span style="font-size:24px">🌱</span>
                <div><div class="strong small">暂时没有明显薄弱章节</div><div class="tiny muted">继续做题，系统会自动找出正确率偏低的章节。</div></div>
              </div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${icon("bookmark")} 最近错题</h2>
          <a class="card-link" href="#/wrongbook">错题本 →</a>
        </div>
        <div class="card-body">
          ${stats.recentWrong.length
            ? stats.recentWrong
                .map(
                  (w) => `<div class="list-row">
                    <div class="grow">
                      <div class="ellipsis small" style="font-weight:600">${esc(w.stem)}</div>
                      <div class="tiny muted">${esc(w.chapterTitle)} · 错 ${w.wrong} 次</div>
                    </div>
                    <span class="badge badge-red">待复习</span>
                  </div>`
                )
                .join("")
            : `<div class="empty" style="padding:26px 10px">
                <div class="empty-icon">${icon("check", 30)}</div>
                <strong>还没有错题</strong>
                <div class="small">做几道题，错题会自动收进这里。</div>
              </div>`}
        </div>
      </div>
    </div>
  </div>`;
}
