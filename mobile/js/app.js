import { api } from "./api.js";
import { icon, esc, toast, openModal, daysBetween } from "./ui.js";

export const store = {
  data: null,
  settings: {},
  chapters: [],
  modules: [],
  papers: [],
};

const NAV = [
  { id: "home", route: "#/home", label: "首页", icon: "home" },
  { id: "learn", route: "#/learn", label: "课程", icon: "book" },
  { id: "practice", route: "#/practice", label: "刷题", icon: "list" },
  { id: "wrongbook", route: "#/wrongbook", label: "错题", icon: "alert", badge: "wrong" },
  { id: "stats", route: "#/stats", label: "统计", icon: "chart" },
];

const TITLES = {
  home: "Python 二级通关",
  learn: "课程学习",
  chapter: "课程学习",
  practice: "题库练习",
  wrongbook: "错题本",
  exam: "模拟考试",
  code: "代码练习",
  stats: "学习统计",
  cheatsheet: "考点速查",
  settings: "设置",
};

let cleanupFns = [];
export function onCleanup(fn) {
  cleanupFns.push(fn);
}

function renderNav() {
  const nav = document.getElementById("mobile-nav");
  nav.innerHTML = NAV.map(
    (item) => `<a class="nav-item" data-nav="${item.id}" href="${item.route}">
      <span class="nav-icon">${icon(item.icon)}</span>
      <span>${item.label}</span>
      <span class="nav-badge hidden" data-badge="${item.badge || ""}"></span>
    </a>`
  ).join("");
}

function updateBadges() {
  const badge = document.querySelector('[data-badge="wrong"]');
  if (badge) {
    const count = store.data?.stats?.wrongCount || 0;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  }
}

function applyTheme() {
  const theme = store.settings.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = store.settings.reduce_motion === "1" ? "reduce" : "";
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0a0e16" : "#4f46e5");
}

export async function refreshData({ silent = true } = {}) {
  try {
    const data = await api.bootstrap();
    store.data = data;
    store.settings = data.settings || {};
    store.chapters = data.chapters || [];
    store.modules = data.modules || [];
    store.papers = data.papers || [];
    applyTheme();
    updateBadges();
    return data;
  } catch (error) {
    if (!silent) toast(error.message, "error");
    throw error;
  }
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, queryString] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryString || ""));
  return { parts, query };
}

function navIdFor(parts) {
  if (!parts.length || parts[0] === "home") return "home";
  if (parts[0] === "chapter") return "learn";
  if (["practice", "wrongbook", "stats"].includes(parts[0])) return parts[0];
  return null;
}

const routes = {
  home: () => import("./views/home.js"),
  learn: () => import("./views/learn.js"),
  chapter: () => import("./views/chapter.js"),
  practice: () => import("./views/practice.js"),
  wrongbook: () => import("./views/wrongbook.js"),
  exam: () => import("./views/exam.js"),
  code: () => import("./views/code.js"),
  stats: () => import("./views/stats.js"),
  cheatsheet: () => import("./views/cheatsheet.js"),
  settings: () => import("./views/settings.js"),
};

function setActiveNav(id) {
  document.querySelectorAll("#mobile-nav .nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.nav === id);
  });
}

function setTitle(key, custom = "") {
  const title = custom || TITLES[key] || "Python 二级通关";
  document.getElementById("mobile-title").textContent = title;
  document.title = key === "home" ? "Python 二级通关" : `${title} · Python 二级通关`;
}

function setBackVisible(visible) {
  document.getElementById("mobile-back").hidden = !visible;
}

async function router() {
  const { parts, query } = parseRoute();
  const key = parts[0] || "home";
  if (!routes[key]) {
    location.hash = "#/home";
    return;
  }
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  cleanupFns = [];
  setActiveNav(navIdFor(parts));
  setTitle(key);
  const rootPages = new Set(["home", "learn", "practice", "wrongbook", "stats"]);
  setBackVisible(!rootPages.has(key));
  const view = document.getElementById("view");
  view.innerHTML = `<div class="page"><div class="card"><div class="card-body"><div class="muted small">正在加载…</div></div></div></div>`;
  try {
    const module = await routes[key]();
    await module.render(view, { parts: parts.slice(1), query, full: parts });
  } catch (error) {
    console.error(error);
    view.innerHTML = `<div class="page"><div class="card"><div class="card-body">
      <h2 style="margin:0 0 8px">页面加载失败</h2>
      <p class="muted small">${esc(error.message)}</p>
      <button class="btn btn-primary" onclick="location.hash='#/home';location.reload()">回到首页</button>
    </div></div></div>`;
  }
  window.scrollTo(0, 0);
}

function setupHeartbeat() {
  setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      await api.heartbeat(30);
    } catch {
      /* ignore */
    }
  }, 30000);
}

function setupBack() {
  document.getElementById("mobile-back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = "#/home";
  });
}

async function onboarding() {
  if (store.settings.onboarded === "1") return;
  const defaultDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  openModal({
    title: "欢迎使用 Python 二级通关",
    width: 520,
    body: `
      <p class="small" style="margin-top:0;color:var(--text-2)">
        13 章课程、260 道选择题、30 道可自动判分的编程题，以及错题本、模拟考试和学习统计。
        手机端可离线使用，代码题在浏览器内运行。
      </p>
      <div class="form-grid" style="margin-top:16px">
        <div class="field">
          <label for="ob-date">考试日期（可留空）</label>
          <input id="ob-date" type="date" value="${esc(store.settings.exam_date || defaultDate)}">
          <div class="hint">设置后首页会显示倒计时</div>
        </div>
        <div class="field">
          <label for="ob-goal">每日练习目标</label>
          <input id="ob-goal" type="number" min="5" max="200" value="${esc(store.settings.daily_goal || "20")}">
          <div class="hint">建议每天 20 道选择题</div>
        </div>
      </div>
      <div class="callout tip" style="margin-top:16px">
        <div class="callout-icon">${icon("bulb", 18)}</div>
        <div class="callout-body">
          <strong class="title">学习建议</strong>
          <p style="margin:0">先按顺序读课程，再做章节练习；错题隔天复习一次，考前两周开始整套模拟。</p>
        </div>
      </div>`,
    actions: [
      {
        label: "开始学习",
        kind: "btn-primary",
        onClick: async ({ button }) => {
          button.disabled = true;
          const examDate = document.getElementById("ob-date").value;
          const goal = document.getElementById("ob-goal").value || "20";
          await api.saveSettings({ exam_date: examDate, daily_goal: goal, onboarded: "1" });
          await refreshData();
          toast("设置完成，开始今天的学习吧", "success");
        },
      },
      {
        label: "稍后设置",
        kind: "btn-ghost",
        onClick: async () => {
          await api.saveSettings({ onboarded: "1" });
          await refreshData();
        },
      },
    ],
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline cache is optional */
    });
  });
}

async function boot() {
  renderNav();
  setupBack();
  registerServiceWorker();
  try {
    await refreshData({ silent: false });
  } catch (error) {
    document.getElementById("view").innerHTML = `<div class="page"><div class="card"><div class="card-body">
      <h2>无法加载学习数据</h2>
      <p class="muted small">${esc(error.message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">重试</button>
    </div></div></div>`;
    return;
  }
  window.addEventListener("hashchange", router);
  await router();
  setupHeartbeat();
  await onboarding();
}

void daysBetween;
boot();
