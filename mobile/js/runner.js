/* Pyodide worker manager. The worker is created lazily on the first run. */
let worker = null;
let readyPromise = null;
let sequence = 0;
let pyodideReady = false;
const pending = new Map();

function terminateWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
  }
  worker = null;
  readyPromise = null;
  pyodideReady = false;
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error("Python 运行时已重置"));
  }
  pending.clear();
}

function ensureWorker() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    try {
      worker = new Worker(new URL("./pyodide-worker.js", import.meta.url));
    } catch (error) {
      reject(new Error(`无法创建 Python 运行器：${error.message}`));
      return;
    }
    const loadTimer = setTimeout(() => {
      reject(new Error("Python 运行时加载超时，请检查网络或重新打开应用"));
      terminateWorker();
    }, 90000);

    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "ready") {
        clearTimeout(loadTimer);
        pyodideReady = true;
        resolve();
        return;
      }
      if (data.type === "fatal") {
        clearTimeout(loadTimer);
        reject(new Error(`无法加载 Python 运行时：${data.error || "未知错误"}`));
        terminateWorker();
        return;
      }
      if (data.type === "result") {
        const item = pending.get(data.id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(data.id);
        item.resolve(data.result);
      }
    };
    worker.onerror = (event) => {
      clearTimeout(loadTimer);
      reject(new Error(`Python 运行器错误：${event.message || "未知错误"}`));
      terminateWorker();
    };
  }).catch((error) => {
    readyPromise = null;
    throw error;
  });
  return readyPromise;
}

export async function runCode(code, stdin = "", files = {}, timeout = 8) {
  await ensureWorker();
  const id = ++sequence;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      terminateWorker();
      resolve({
        ok: false,
        stdout: "",
        stderr: `运行超时（超过 ${timeout} 秒），已终止。`,
        returncode: -1,
        durationMs: timeout * 1000,
        timedOut: true,
        truncated: false,
      });
    }, Math.max(1, timeout) * 1000);
    pending.set(id, { resolve, reject: () => {}, timer });
    worker.postMessage({
      type: "run",
      id,
      code,
      stdin,
      files,
    });
  });
}

export function isReady() {
  return pyodideReady;
}

export function warmup() {
  return ensureWorker();
}
