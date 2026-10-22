/* Runs learner code inside Pyodide (Python compiled to WebAssembly). */
const base = new URL("../pyodide/", self.location).href;
importScripts(new URL("pyodide.js", base).href);

const WRAPPER = `
import sys, io, os, json, traceback

payload = json.loads(PAYLOAD)
base = "/tmp/pyl2-run"
os.makedirs(base, exist_ok=True)
os.chdir(base)

for name, content in (payload.get("files") or {}).items():
    path = os.path.join(base, name)
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)

_stdout, _stderr = sys.stdout, sys.stderr
sys.stdin = io.StringIO(payload.get("stdin") or "")
_out, _err = io.StringIO(), io.StringIO()
sys.stdout, sys.stderr = _out, _err
_error = False
try:
    exec(compile(payload.get("code") or "", "main.py", "exec"), {"__name__": "__main__", "__file__": "main.py"})
except SystemExit:
    pass
except BaseException:
    _error = True
    traceback.print_exc()
finally:
    sys.stdout, sys.stderr = _stdout, _stderr

json.dumps({"stdout": _out.getvalue(), "stderr": _err.getvalue(), "error": _error})
`;

let pyodide = null;

const initPromise = (async () => {
  pyodide = await loadPyodide({ indexURL: base });
  self.postMessage({ type: "ready" });
})().catch((error) => {
  self.postMessage({ type: "fatal", error: String(error?.message || error) });
  throw error;
});

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type !== "run") return;
  const started = performance.now();
  try {
    await initPromise;
    pyodide.globals.set(
      "PAYLOAD",
      JSON.stringify({
        code: data.code || "",
        stdin: data.stdin || "",
        files: data.files || {},
      })
    );
    const raw = pyodide.runPython(WRAPPER);
    const parsed = JSON.parse(raw);
    self.postMessage({
      type: "result",
      id: data.id,
      result: {
        ok: !parsed.error,
        stdout: parsed.stdout || "",
        stderr: parsed.stderr || "",
        returncode: parsed.error ? 1 : 0,
        durationMs: Math.round(performance.now() - started),
        timedOut: false,
        truncated: false,
      },
    });
  } catch (error) {
    self.postMessage({
      type: "result",
      id: data.id,
      result: {
        ok: false,
        stdout: "",
        stderr: String(error?.message || error),
        returncode: 1,
        durationMs: Math.round(performance.now() - started),
        timedOut: false,
        truncated: false,
      },
    });
  }
};
