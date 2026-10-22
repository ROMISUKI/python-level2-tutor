import { api } from "../api.js";
import { icon, esc, toast } from "../ui.js";

export async function render(root) {
  const data = await api.cheatsheet();
  let query = "";
  const collapsed = new Set();

  function filteredGroups() {
    const q = query.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.name} ${item.syntax} ${item.desc}`.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length);
  }

  function paint() {
    const groups = filteredGroups();
    root.innerHTML = `<div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Cheat Sheet</div>
          <h1 class="page-title">考点速查</h1>
          <p class="page-sub">考前快速过一遍：语法、常用方法、标准库和公共基础知识。支持关键词搜索。</p>
        </div>
        <div class="page-actions"><span class="badge badge-outline">${data.groups.reduce((sum, group) => sum + group.items.length, 0)} 条速查</span></div>
      </div>

      <div class="filter-bar">
        <div class="search-box">
          ${icon("search", 16)}
          <input id="cheat-search" type="search" placeholder="搜索 format、切片、排序、范式…" value="${esc(query)}" autocomplete="off">
        </div>
        ${query ? `<button class="btn btn-ghost" id="clear-search">清除</button>` : ""}
      </div>

      ${groups.length
        ? groups
            .map((group) => {
              const open = !collapsed.has(group.id) || Boolean(query);
              return `<section class="cheat-group">
                <button class="cheat-head" data-group="${group.id}">
                  <span class="stat-icon" style="width:30px;height:30px;border-radius:9px">${icon("book", 15)}</span>
                  <h3>${esc(group.title)}</h3>
                  <span class="badge badge-outline">${group.items.length} 条</span>
                  <span class="muted" style="transform:rotate(${open ? 0 : -90}deg);transition:transform .2s">${icon("chevronDown", 16)}</span>
                </button>
                <div class="cheat-body ${open ? "" : "hidden"}">
                  ${group.items
                    .map(
                      (item) => `<div class="cheat-item">
                        <div><div class="cheat-name">${esc(item.name)}</div><span class="cheat-syntax">${esc(item.syntax)}</span></div>
                        <div class="cheat-desc">${esc(item.desc)}</div>
                      </div>`
                    )
                    .join("")}
                </div>
              </section>`;
            })
            .join("")
        : `<div class="card"><div class="card-body"><div class="empty"><div class="empty-icon">${icon("search", 32)}</div><strong>没有找到相关内容</strong><div class="small">换个关键词试试，例如「切片」「排序」「异常」。</div></div></div></div>`}
    </div>`;

    const input = document.getElementById("cheat-search");
    input?.addEventListener("input", (event) => {
      query = event.target.value;
      const position = input.selectionStart;
      paint();
      const next = document.getElementById("cheat-search");
      next.focus();
      next.setSelectionRange(position, position);
    });
    document.getElementById("clear-search")?.addEventListener("click", () => {
      query = "";
      paint();
    });
    root.querySelectorAll("[data-group]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.group;
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        paint();
      });
    });
    root.querySelectorAll(".cheat-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const text = item.querySelector(".cheat-syntax")?.textContent || "";
        try {
          await navigator.clipboard.writeText(text);
          toast("已复制语法", "success");
        } catch {
          toast("复制失败", "error");
        }
      });
    });
  }

  paint();
}
