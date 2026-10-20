const TOKEN = window.__APP_TOKEN__;

async function request(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": TOKEN,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data?.error || `请求失败（${response.status}）`);
  }
  return data;
}

export const api = {
  bootstrap: () => request("GET", "/api/bootstrap"),
  stats: () => request("GET", "/api/stats"),
  chapters: () => request("GET", "/api/chapters"),
  chapter: (id) => request("GET", `/api/chapter/${encodeURIComponent(id)}`),
  markChapter: (id, section, seconds) =>
    request("POST", `/api/chapter/${encodeURIComponent(id)}/progress`, { section, seconds }),
  questions: (params) => {
    const query = new URLSearchParams(params).toString();
    return request("GET", `/api/questions?${query}`);
  },
  answer: (questionId, choice, durationMs, context = "practice") =>
    request("POST", "/api/answer", { questionId, choice, durationMs, context }),
  bookmark: (qid, value) => request("POST", "/api/bookmark", { qid, value }),
  wrongbook: () => request("GET", "/api/wrongbook"),
  removeWrong: (qid) => request("POST", "/api/wrongbook/remove", { qid }),
  bookmarks: () => request("GET", "/api/bookmarks"),
  exercises: () => request("GET", "/api/exercises"),
  exercise: (id) => request("GET", `/api/exercise/${encodeURIComponent(id)}`),
  runExercise: (id, code, scope = "all") =>
    request("POST", `/api/exercise/${encodeURIComponent(id)}/run`, { code, scope }),
  solution: (id) => request("GET", `/api/exercise/${encodeURIComponent(id)}/solution`),
  run: (code, stdin = "") => request("POST", "/api/run", { code, stdin }),
  startExam: (paper) => request("POST", "/api/exam/start", { paper }),
  submitExam: (sessionId, answers, codes, durationSec) =>
    request("POST", "/api/exam/submit", { sessionId, answers, codes, durationSec }),
  examResult: (id) => request("GET", `/api/exam/${encodeURIComponent(id)}`),
  cheatsheet: () => request("GET", "/api/cheatsheet"),
  saveSettings: (patch) => request("POST", "/api/settings", patch),
  heartbeat: (seconds) => request("POST", "/api/heartbeat", { seconds }),
  reset: () => request("POST", "/api/reset"),
  exportData: () => request("GET", "/api/export"),
  importData: (payload) => request("POST", "/api/import", payload),
};
