const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.5-4.5"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  sparkles: '<path d="M12 3l1.9 4.8L19 9.7l-4.2 3.1L16 18l-4-2.6L8 18l1.2-5.2L5 9.7l5.1-1.9z"/>',
  flame: '<path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>',
  download: '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><polyline points="7 14 12 9 17 14"/><path d="M5 3h14"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><path d="M12 19h8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  star: '<polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6"/>',
  filter: '<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M8.5 13 7 22l5-3 5 3-1.5-9"/>',
};

export function icon(name, size = 18) {
  const body = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" ")
);
const BUILTINS = new Set(
  "abs all any bin bool chr dict divmod enumerate eval filter float format frozenset getattr hasattr hash hex input int isinstance issubclass iter len list map max min next object oct open ord pow print range repr reversed round set setattr slice sorted str sum tuple type zip".split(" ")
);

export function highlightPython(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === "#") {
      let j = code.indexOf("\n", i);
      if (j === -1) j = n;
      out += `<span class="cm-comment">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = code.slice(i, i + 3);
      if (triple === '"""' || triple === "'''") {
        let j = code.indexOf(triple, i + 3);
        j = j === -1 ? n : j + 3;
        out += `<span class="cm-string">${esc(code.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === ch) { j += 1; break; }
        if (code[j] === "\n") break;
        j += 1;
      }
      out += `<span class="cm-string">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-FxXoObB._eE+-]/.test(code[j])) {
        if ((code[j] === "+" || code[j] === "-") && !/[eE]/.test(code[j - 1])) break;
        j += 1;
      }
      out += `<span class="cm-number">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (/[A-Za-z_\u4e00-\u9fa5]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_\u4e00-\u9fa5]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      if (KEYWORDS.has(word)) out += `<span class="cm-keyword">${word}</span>`;
      else if (BUILTINS.has(word)) out += `<span class="cm-builtin">${word}</span>`;
      else if (code[j] === "(") out += `<span class="cm-def">${esc(word)}</span>`;
      else out += esc(word);
      i = j;
      continue;
    }
    out += esc(ch);
    i += 1;
  }
  return out;
}

export function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

export function formatDuration(seconds) {
  if (!seconds) return "0 分钟";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${Math.max(1, m)} 分钟`;
}

export function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (x) => String(x).padStart(2, "0");
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime ? `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}` : base;
}

export function daysBetween(dateText) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function toast(message, type = "") {
  const root = document.getElementById("toast-root");
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(type === "error" ? "alert" : type === "success" ? "check" : "info", 16)}<span>${esc(message)}</span>`;
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity .2s ease, transform .2s ease";
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

export function openModal({ title, body, actions = [], onClose, width = 560 }) {
  const root = document.getElementById("modal-root");
  const mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.innerHTML = `
    <div class="modal-card" style="width:min(${width}px,100%)" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="modal-x" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? '<div class="modal-foot"></div>' : ""}
    </div>`;
  root.appendChild(mask);
  const close = () => {
    mask.remove();
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  mask.addEventListener("click", (event) => {
    if (event.target === mask) close();
  });
  mask.querySelector(".modal-x").addEventListener("click", close);
  const foot = mask.querySelector(".modal-foot");
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.className = `btn ${action.kind || "btn-ghost"}`;
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      if (action.onClick) {
        const result = await action.onClick({ close, button });
        if (result === false) return;
      }
      if (action.close !== false) close();
    });
    foot.appendChild(button);
  });
  return { close, element: mask };
}

export function confirmDialog(title, message, { okLabel = "确定", danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const { close } = openModal({
      title,
      body: `<p class="small" style="margin:0;color:var(--text-2)">${esc(message)}</p>`,
      actions: [
        { label: "取消", kind: "btn-ghost", onClick: () => { settled = true; resolve(false); } },
        {
          label: okLabel,
          kind: danger ? "btn-danger" : "btn-primary",
          onClick: () => { settled = true; resolve(true); },
        },
      ],
      onClose: () => { if (!settled) resolve(false); },
      width: 440,
    });
    void close;
  });
}

export function emptyState(iconName, title, desc, action = "") {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 34)}</div>
    <strong>${esc(title)}</strong>
    <div class="small">${esc(desc)}</div>
    ${action ? `<div style="margin-top:14px">${action}</div>` : ""}
  </div>`;
}

export function ring(percent, size = 132, stroke = 9) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, percent || 0));
  const offset = circumference * (1 - value / 100);
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--primary)"/><stop offset="100%" stop-color="var(--primary-2)"/>
      </linearGradient></defs>
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${radius}"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${radius}"
        stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
    </svg>
    <div class="ring-center"><strong>${Math.round(value)}%</strong><span>题库覆盖</span></div>
  </div>`;
}

export function codeBlock({ title = "Python", code, note = "", runnable = true, id = "", stdin = "" }) {
  return `<div class="code-block" data-code-id="${esc(id)}" data-stdin="${esc(stdin)}">
    <div class="code-head">
      <span class="code-dots"><i></i><i></i><i></i></span>
      <span class="code-title">${esc(title)}</span>
      <span class="code-actions">
        <button class="code-btn" data-action="copy">复制</button>
        ${runnable ? '<button class="code-btn primary" data-action="run">运行</button>' : ""}
      </span>
    </div>
    <pre class="code-body"><code>${highlightPython(code)}</code></pre>
    ${note ? `<div class="code-note">${esc(note)}</div>` : ""}
    <div class="code-out hidden">
      <div class="code-out-head"><span>运行结果</span><span data-role="time"></span></div>
      <pre></pre>
    </div>
  </div>`;
}

export function debounce(fn, delay = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function difficultyLabel(level) {
  return ["", "入门", "进阶", "挑战", "综合"][level] || "入门";
}

export function levelLabel(level) {
  return { basic: "基本操作", simple: "简单应用", comprehensive: "综合应用" }[level] || "练习";
}
