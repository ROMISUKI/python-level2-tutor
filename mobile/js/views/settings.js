import { api } from "../api.js";
import { refreshData, store } from "../app.js";
import { icon, esc, toast, confirmDialog } from "../ui.js";

export async function render(root) {
  const settings = store.settings;
  const stats = store.data.stats;

  root.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Settings</div>
        <h1 class="page-title">设置</h1>
        <p class="page-sub">学习数据保存在浏览器的本地存储中，不会上传到任何服务器。可以随时导出备份或重置进度。</p>
      </div>
    </div>

    <div class="grid grid-2" style="align-items:start">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2 class="card-title">${icon("target")} 学习目标</h2></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="field">
                <label for="set-nickname">昵称</label>
                <input id="set-nickname" value="${esc(settings.nickname || "")}" placeholder="留空则显示「同学」">
              </div>
              <div class="field">
                <label for="set-date">考试日期</label>
                <input id="set-date" type="date" value="${esc(settings.exam_date || "")}">
              </div>
              <div class="field">
                <label for="set-goal">每日练习目标（题）</label>
                <input id="set-goal" type="number" min="5" max="200" value="${esc(settings.daily_goal || "20")}">
              </div>
            </div>
            <div class="row" style="margin-top:16px;justify-content:flex-end">
              <button class="btn btn-primary" id="save-goal">${icon("check", 15)} 保存设置</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">${icon("sparkles")} 外观</h2></div>
          <div class="card-body">
            <div class="field" style="margin-bottom:10px"><label>主题</label></div>
            <div class="theme-options">
              <button class="theme-opt ${settings.theme !== "dark" ? "active" : ""}" data-theme="light">☀️ 浅色</button>
              <button class="theme-opt ${settings.theme === "dark" ? "active" : ""}" data-theme="dark">🌙 深色</button>
            </div>
            <div class="switch-row" style="margin-top:14px">
              <div><div class="strong small">减少动画</div><div class="tiny muted">关闭页面切换和进度条动画</div></div>
              <button class="switch ${settings.reduce_motion === "1" ? "on" : ""}" id="toggle-motion" aria-label="减少动画"></button>
            </div>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2 class="card-title">${icon("download")} 数据管理</h2></div>
          <div class="card-body">
            <div class="list-row">
              <div class="grow"><div class="small strong">导出学习记录</div><div class="tiny muted">生成 JSON 备份，包含答题记录、错题和考试成绩。</div></div>
              <button class="btn btn-soft btn-sm" id="export-data">导出</button>
            </div>
            <div class="list-row">
              <div class="grow"><div class="small strong">导入备份</div><div class="tiny muted">导入会覆盖当前全部学习记录，请谨慎操作。</div></div>
              <button class="btn btn-ghost btn-sm" id="import-data">导入</button>
              <input type="file" id="import-file" accept="application/json,.json" hidden>
            </div>
            <div class="list-row">
              <div class="grow"><div class="small strong" style="color:var(--red)">重置学习进度</div><div class="tiny muted">清空所有答题、错题和考试记录，题库本身不受影响。</div></div>
              <button class="btn btn-danger btn-sm" id="reset-data">重置</button>
            </div>
            <div class="callout warn" style="margin:14px 0 0">
              <div class="callout-icon">${icon("info", 17)}</div>
              <div class="callout-body tiny">数据保存在浏览器本地存储（localStorage），不会上传到任何服务器。清除浏览器网站数据会删除进度，建议定期使用上方“导出”备份。</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">${icon("info")} 关于</h2></div>
          <div class="card-body">
            <div class="row" style="gap:12px">
              <span class="brand-mark" style="width:44px;height:44px">Py</span>
              <div><div class="strong">Python 二级通关</div><div class="tiny muted">版本 ${esc(store.data.app.version)} · 完全离线运行</div></div>
            </div>
            <hr class="hr">
            <div class="grid grid-2" style="gap:10px">
              <div><div class="stat-value" style="font-size:18px">${store.chapters.length}</div><div class="tiny muted">教学章节</div></div>
              <div><div class="stat-value" style="font-size:18px">260</div><div class="tiny muted">选择题</div></div>
              <div><div class="stat-value" style="font-size:18px">30</div><div class="tiny muted">编程题</div></div>
              <div><div class="stat-value" style="font-size:18px">${stats.totals.exams}</div><div class="tiny muted">已完成模拟</div></div>
            </div>
            <hr class="hr">
            <div class="tiny muted" style="line-height:1.8">
              题库依据全国计算机等级考试二级 Python 语言程序设计考试大纲编写，代码示例在 Python 3.10 下验证。
              本程序用于辅助备考，不隶属于考试主办机构。
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">${icon("sparkles")} 安装到手机主屏幕</h2></div>
          <div class="card-body">
            <div class="small" style="color:var(--text-2);line-height:1.8">
              <strong>Android / Chrome：</strong>右上角菜单 → “添加到主屏幕”或“安装应用”。<br>
              <strong>iPhone / Safari：</strong>底部分享按钮 → “添加到主屏幕”。<br>
              安装后会以独立窗口启动，首次打开需要联网加载，之后可离线使用。
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">${icon("terminal")} 使用提示</h2></div>
          <div class="card-body">
            <div class="list-row"><span class="small">代码题判分</span><span class="spacer"></span><span class="tiny muted">浏览器内 Python 运行时</span></div>
            <div class="list-row"><span class="small">首次运行代码</span><span class="spacer"></span><span class="tiny muted">需加载约 13 MB，约 5–15 秒</span></div>
            <div class="list-row"><span class="small">选择题作答</span><span class="spacer"></span><span class="tiny muted">点击选项后提交</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  async function save(patch, message = "已保存") {
    try {
      const result = await api.saveSettings(patch);
      store.settings = result.settings;
      await refreshData();
      toast(message, "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  document.getElementById("save-goal").addEventListener("click", () => {
    save({
      nickname: document.getElementById("set-nickname").value.trim(),
      exam_date: document.getElementById("set-date").value,
      daily_goal: document.getElementById("set-goal").value || "20",
    });
  });

  root.querySelectorAll("[data-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.theme;
      root.querySelectorAll("[data-theme]").forEach((item) => item.classList.toggle("active", item === button));
      save({ theme }, "主题已切换");
    });
  });

  document.getElementById("toggle-motion").addEventListener("click", (event) => {
    const next = event.currentTarget.classList.contains("on") ? "0" : "1";
    save({ reduce_motion: next }, next === "1" ? "已减少动画" : "已恢复动画");
  });

  document.getElementById("export-data").addEventListener("click", async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `python-level2-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast("备份已导出", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  document.getElementById("import-data").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const ok = await confirmDialog("导入备份？", "当前学习记录会被备份文件中的内容覆盖，此操作不可撤销。", { okLabel: "覆盖导入", danger: true });
    if (!ok) {
      event.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await api.importData(payload);
      await refreshData();
      toast("备份已导入，正在刷新", "success");
      setTimeout(() => location.reload(), 600);
    } catch (error) {
      toast(`导入失败：${error.message}`, "error");
    }
  });

  document.getElementById("reset-data").addEventListener("click", async () => {
    const ok = await confirmDialog(
      "重置全部学习进度？",
      `将清空 ${stats.totals.answered} 条答题记录、${stats.wrongCount} 道错题和 ${stats.totals.exams} 次考试记录。此操作不可撤销。`,
      { okLabel: "确认重置", danger: true }
    );
    if (!ok) return;
    await api.reset();
    await refreshData();
    toast("学习进度已重置", "success");
    location.hash = "#/home";
  });
}
