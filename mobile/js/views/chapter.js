import { api } from "../api.js";
import { onCleanup, store, refreshData } from "../app.js";
import { icon, esc, codeBlock, toast, highlightPython } from "../ui.js";

function renderSection(section, index, questions) {
  const anchor = `sec-${index}`;
  if (section.type === "text") {
    return `<section class="prose" id="${anchor}" style="margin-top:26px"><h2>${esc(section.title)}</h2>${section.html}</section>`;
  }
  if (section.type === "code") {
    return `<section id="${anchor}" style="margin-top:26px">
      <div class="row" style="margin-bottom:-2px">
        <h2 style="font-size:17px;margin:0;display:flex;align-items:center;gap:8px">
          <span style="width:4px;height:17px;border-radius:4px;background:linear-gradient(180deg,var(--primary),var(--primary-2));display:inline-block"></span>
          ${esc(section.title)}
        </h2>
      </div>
      ${codeBlock({ title: section.title, code: section.code, note: section.note || "", runnable: section.run !== false, id: anchor, stdin: section.stdin || "" })}
    </section>`;
  }
  if (section.type === "table") {
    return `<section class="prose" id="${anchor}" style="margin-top:26px">
      <h2>${esc(section.title)}</h2>
      <table><thead><tr>${section.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${section.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    </section>`;
  }
  if (section.type === "tip" || section.type === "warn") {
    const isTip = section.type === "tip";
    return `<div class="callout ${isTip ? "tip" : "warn"}" id="${anchor}">
      <div class="callout-icon">${icon(isTip ? "bulb" : "alert", 18)}</div>
      <div class="callout-body"><strong class="title">${esc(section.title)}</strong><div class="prose" style="font-size:13.2px;line-height:1.75">${section.html}</div></div>
    </div>`;
  }
  if (section.type === "list") {
    return `<section class="prose" id="${anchor}" style="margin-top:22px">
      ${section.title ? `<h2>${esc(section.title)}</h2>` : ""}
      <ul>${section.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    </section>`;
  }
  if (section.type === "quiz") {
    const question = questions.find((q) => q.id === section.qid);
    if (!question) return "";
    return `<div class="quiz-embed" data-quiz="${esc(question.id)}" id="${anchor}">
      <div class="q-meta"><span class="badge badge-primary">随堂检测</span><span class="tiny muted">点击选项立即判分</span></div>
      <div class="q-stem">${esc(question.stem)}</div>
      ${question.code ? `<pre class="q-code">${highlightPython(question.code)}</pre>` : ""}
      <div class="options">
        ${question.options
          .map(
            (option, i) => `<button class="option" data-index="${i}">
              <span class="option-key">${"ABCD"[i]}</span>
              <span class="option-text">${esc(option)}</span>
            </button>`
          )
          .join("")}
      </div>
      <div class="feedback-slot"></div>
    </div>`;
  }
  return "";
}

export async function render(root, { parts }) {
  const cid = parts[0];
  let chapter;
  try {
    chapter = await api.chapter(cid);
  } catch (error) {
    root.innerHTML = `<div class="page"><div class="card"><div class="card-body"><h2>章节不存在</h2><p class="muted">${esc(error.message)}</p><a class="btn btn-primary" href="#/learn">返回课程</a></div></div></div>`;
    return;
  }

  const module = store.modules.find((m) => m.id === chapter.module);
  const sections = chapter.sections || [];
  const toc = sections
    .filter((section) => section.type === "text" || section.type === "table")
    .map((section, index) =>
      section.title ? `<a class="toc-item" href="#sec-${sections.indexOf(section)}" data-toc="${sections.indexOf(section)}">${esc(section.title)}</a>` : ""
    )
    .join("");
  const progress = chapter.progress || {};

  root.innerHTML = `
  <div class="page">
    <div class="row small muted mobile-breadcrumb" style="margin-bottom:14px">
      <a href="#/learn" class="row" style="gap:5px">${icon("arrowLeft", 14)} 课程学习</a>
      <span>/</span>
      <span>${esc(chapter.moduleName || module?.name || "")}</span>
    </div>

    <div class="chapter-hero">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
        <div>
          <div class="row" style="gap:8px">
            <span class="badge" style="color:${module?.color || "var(--primary)"};background:color-mix(in srgb, ${module?.color || "var(--primary)"} 12%, transparent)">${esc(chapter.moduleName)}</span>
            <span class="badge badge-outline">第 ${String(chapter.order).padStart(2, "0")} 章</span>
            ${progress.read_at ? `<span class="badge badge-green">${icon("check", 12)} 已读</span>` : ""}
          </div>
          <h1>${esc(chapter.title)}</h1>
          <div class="sub">${esc(chapter.subtitle)}</div>
          <div class="chapter-hero-meta">
            <span>${icon("clock", 14)} 约 ${chapter.minutes} 分钟</span>
            <span>${icon("list", 14)} ${chapter.questions.length} 道配套题</span>
            <span>${icon("layers", 14)} ${sections.length} 个小节</span>
          </div>
        </div>
        <a class="btn btn-primary" href="#/practice?chapter=${chapter.id}&auto=1">${icon("play", 15)} 章节练习</a>
      </div>
    </div>

    <div class="chapter-layout">
      <div class="chapter-main">
        <div class="prose">
          ${sections.map((section, index) => renderSection(section, index, chapter.questions)).join("")}
        </div>

        <div class="card" style="margin-top:26px">
          <div class="card-head"><h2 class="card-title">${icon("star")} 本章考点清单</h2></div>
          <div class="card-body">
            <ul class="objective-list" style="font-size:13px">${chapter.keypoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
            <hr class="hr">
            <div class="row" style="gap:8px;align-items:flex-start">
              <span class="badge badge-amber">易错</span>
              <div class="grow small" style="color:var(--text-2)">${chapter.pitfalls.map((p) => `<div style="margin:3px 0">· ${esc(p)}</div>`).join("")}</div>
            </div>
            <hr class="hr">
            <p class="small" style="margin:0;color:var(--text-2);line-height:1.8"><strong>本章小结：</strong>${esc(chapter.summary)}</p>
          </div>
        </div>

        <div class="chapter-end" id="chapter-end">
          <div class="row" style="justify-content:space-between;gap:14px;flex-wrap:wrap">
            <div>
              <h3>读完了？用 10 道题检验一下</h3>
              <p>错题会自动进入错题本，并按 1 / 2 / 4 / 7 天的间隔提醒复习。</p>
            </div>
            <div class="row">
              <button class="btn btn-ghost" id="mark-read">${icon("check", 15)} 标记已读</button>
              <a class="btn btn-primary" href="#/practice?chapter=${chapter.id}&auto=1">开始练习 ${icon("arrowRight", 15)}</a>
            </div>
          </div>
        </div>

        <div class="row" style="justify-content:space-between;margin-top:18px">
          ${chapter.order > 1 ? `<a class="btn btn-ghost" href="#/chapter/ch${String(chapter.order - 1).padStart(2, "0")}">${icon("arrowLeft", 15)} 上一章</a>` : "<span></span>"}
          ${chapter.order < store.chapters.length ? `<a class="btn btn-ghost" href="#/chapter/ch${String(chapter.order + 1).padStart(2, "0")}">下一章 ${icon("arrowRight", 15)}</a>` : "<span></span>"}
        </div>
      </div>

      <aside class="chapter-aside">
        <div class="aside-card">
          <h4>本章目标</h4>
          <ul class="objective-list">${chapter.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
        </div>
        <div class="aside-card">
          <h4>目录</h4>
          <div class="toc-list">${toc}</div>
        </div>
        <div class="aside-card">
          <h4>进度</h4>
          <div class="row" style="justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span class="muted">做过的题</span><span class="strong">${chapter.questions.filter((q) => q.state.seen).length}/${chapter.questions.length}</span>
          </div>
          <div class="progress progress-sm"><div class="progress-bar" style="width:${(chapter.questions.filter((q) => q.state.seen).length / Math.max(1, chapter.questions.length)) * 100}%"></div></div>
          <div class="tiny muted" style="margin-top:8px">${progress.read_at ? `上次阅读 ${String(progress.read_at).slice(0, 10)}` : "还没有标记为已读"}</div>
        </div>
      </aside>
    </div>
  </div>`;

  // ---- code blocks -------------------------------------------------------
  root.querySelectorAll(".code-block").forEach((block) => {
    const code = block.querySelector("code").textContent;
    const runButton = block.querySelector('[data-action="run"]');
    const copyButton = block.querySelector('[data-action="copy"]');
    copyButton?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        toast("已复制代码", "success");
      } catch {
        toast("复制失败，请手动选择", "error");
      }
    });
    runButton?.addEventListener("click", async () => {
      const out = block.querySelector(".code-out");
      const pre = out.querySelector("pre");
      runButton.disabled = true;
      runButton.textContent = "运行中…";
      out.classList.remove("hidden");
      out.classList.remove("error");
      pre.textContent = "";
      try {
        const result = await api.run(code, block.dataset.stdin || "");
        const text = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
        pre.textContent = text || "（没有输出）";
        out.classList.toggle("error", !result.ok);
        out.querySelector('[data-role="time"]').textContent = `${result.durationMs} ms`;
      } catch (error) {
        out.classList.add("error");
        pre.textContent = error.message;
      } finally {
        runButton.disabled = false;
        runButton.textContent = "运行";
      }
    });
  });

  // ---- inline quizzes ----------------------------------------------------
  root.querySelectorAll("[data-quiz]").forEach((card) => {
    const qid = card.dataset.quiz;
    const options = [...card.querySelectorAll(".option")];
    options.forEach((button) => {
      button.addEventListener("click", async () => {
        if (card.dataset.done) return;
        card.dataset.done = "1";
        const choice = Number(button.dataset.index);
        options.forEach((opt) => opt.classList.add("disabled"));
        try {
          const result = await api.answer(qid, choice, 0, "chapter");
          options[result.question.answer].classList.add("correct");
          if (!result.correct) button.classList.add("wrong");
          const slot = card.querySelector(".feedback-slot");
          slot.innerHTML = `<div class="feedback ${result.correct ? "ok" : "bad"}">
            <div class="feedback-head">${icon(result.correct ? "check" : "x", 16)} ${result.correct ? "回答正确" : "再想一想"}</div>
            <div class="feedback-body">
              <p>正确答案：<strong>${"ABCD"[result.question.answer]}. ${esc(result.question.options[result.question.answer])}</strong></p>
              <p>${esc(result.question.explanation)}</p>
            </div>
          </div>`;
          refreshData().catch(() => {});
        } catch (error) {
          card.dataset.done = "";
          toast(error.message, "error");
        }
      });
    });
  });

  // ---- TOC smooth scroll -------------------------------------------------
  root.querySelectorAll("[data-toc]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(`sec-${link.dataset.toc}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // ---- mark as read ------------------------------------------------------
  let marked = Boolean(progress.read_at);
  const started = Date.now();
  async function markRead(showToast = true) {
    if (marked) {
      if (showToast) toast("本章已读过了");
      return;
    }
    marked = true;
    const seconds = Math.round((Date.now() - started) / 1000);
    try {
      await api.markChapter(chapter.id, sections.length, seconds);
      const button = document.getElementById("mark-read");
      if (button) {
        button.disabled = true;
        button.innerHTML = `${icon("check", 15)} 已标记`;
      }
      if (showToast) toast("已记录本章学习进度", "success");
      refreshData().catch(() => {});
    } catch (error) {
      marked = false;
      if (showToast) toast(error.message, "error");
    }
  }
  document.getElementById("mark-read")?.addEventListener("click", () => markRead(true));

  const end = document.getElementById("chapter-end");
  let observer = null;
  if (end && !marked) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markRead(false);
          observer?.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(end);
  }
  onCleanup(() => {
    observer?.disconnect();
    if (!marked) {
      const seconds = Math.round((Date.now() - started) / 1000);
      if (seconds > 20) api.markChapter(chapter.id, sections.length, seconds).catch(() => {});
    }
  });
}
