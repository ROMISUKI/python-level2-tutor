/* Local, offline implementation of the HTTP API used by the desktop views. */
import { runCode } from "./runner.js";

const CONTENT_BASE = new URL("../content/", import.meta.url);
const STORAGE_KEY = "pyl2-mobile-db-v1";
const VERSION = 1;

const DEFAULT_SETTINGS = {
  theme: "light",
  exam_date: "",
  daily_goal: "20",
  reduce_motion: "0",
  nickname: "",
  onboarded: "0",
};

let meta = null;
let chapters = {};
let questions = {};
let exercises = {};
let cheatsheet = { groups: [] };
let modules = [];
let contentPromise = null;
let db = loadDb();
const examCache = new Map();

/* ------------------------------------------------------------------ utils */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function daysLeft(dateText) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------- load */
async function fetchJson(relative) {
  const response = await fetch(new URL(relative, CONTENT_BASE));
  if (!response.ok) throw new Error(`无法加载内容：${relative}（${response.status}）`);
  return response.json();
}

async function ensureContent() {
  if (contentPromise) return contentPromise;
  contentPromise = (async () => {
    const index = await fetchJson("index.json");
    const [metaData, cheatData, ...files] = await Promise.all([
      fetchJson(index.meta),
      fetchJson(index.cheatsheet),
      ...index.chapters.map(fetchJson),
      ...index.questions.map(fetchJson),
      ...index.exercises.map(fetchJson),
    ]);
    meta = metaData;
    modules = meta.modules || [];
    chapters = {};
    questions = {};
    exercises = {};
    let cursor = 0;
    index.chapters.forEach(() => {
      const chapter = files[cursor++];
      chapters[chapter.id] = chapter;
    });
    index.questions.forEach(() => {
      const payload = files[cursor++];
      (payload.questions || []).forEach((question) => {
        questions[question.id] = question;
      });
    });
    index.exercises.forEach(() => {
      const payload = files[cursor++];
      (payload.exercises || []).forEach((exercise) => {
        exercises[exercise.id] = exercise;
      });
    });
    cheatsheet = cheatData;
    return true;
  })();
  return contentPromise;
}

/* -------------------------------------------------------------------- db */
function defaultDb() {
  return {
    app: "PythonLevel2Tutor",
    version: VERSION,
    exported_at: "",
    settings: { ...DEFAULT_SETTINGS },
    qstate: {},
    attempts: [],
    exstate: {},
    exams: [],
    study_days: {},
    chapter_progress: {},
  };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDb();
    const parsed = JSON.parse(raw);
    const base = defaultDb();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      qstate: parsed.qstate || {},
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      exstate: parsed.exstate || {},
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      study_days: parsed.study_days || {},
      chapter_progress: parsed.chapter_progress || {},
    };
  } catch {
    return defaultDb();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    // localStorage is usually 5 MB; keep the newest attempts if it fills up.
    try {
      db.attempts = db.attempts.slice(-1500);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return true;
    } catch {
      return false;
    }
  }
}

function qstate(qid) {
  if (!db.qstate[qid]) {
    db.qstate[qid] = {
      qid,
      seen: 0,
      right: 0,
      wrong: 0,
      streak: 0,
      last_result: null,
      last_seen: null,
      next_review: null,
      bookmarked: 0,
      mastered: 0,
    };
  }
  return db.qstate[qid];
}

function publicState(state) {
  return {
    seen: state?.seen || 0,
    right: state?.right || 0,
    wrong: state?.wrong || 0,
    bookmarked: Boolean(state?.bookmarked),
    mastered: Boolean(state?.mastered),
    nextReview: state?.next_review || null,
  };
}

function publicQuestion(question) {
  return {
    id: question.id,
    chapter: question.chapter,
    difficulty: question.difficulty || 1,
    stem: question.stem,
    options: question.options,
    tags: question.tags || [],
    code: question.code || null,
  };
}

function fullQuestion(question) {
  return {
    ...question,
    publicBasic: isPublicBasic(question),
  };
}

function isPublicBasic(question) {
  return chapters[question.chapter]?.module === "m5";
}

function relatedQuestions(cid) {
  return Object.values(questions).filter((q) => q.chapter === cid);
}

function chapterSummaries() {
  return Object.values(chapters)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((chapter) => {
      const module = modules.find((m) => m.id === chapter.module) || {};
      const related = relatedQuestions(chapter.id);
      const states = related.map((q) => db.qstate[q.id]).filter(Boolean);
      const seen = states.filter((s) => s.seen).length;
      const right = states.filter((s) => s.right > 0).length;
      const wrong = states.filter((s) => s.wrong > 0).length;
      return {
        id: chapter.id,
        title: chapter.title,
        subtitle: chapter.subtitle || "",
        module: chapter.module,
        moduleName: module.name || "",
        moduleColor: module.color || "",
        order: chapter.order || 0,
        minutes: chapter.minutes || 30,
        objectives: chapter.objectives || [],
        keypoints: (chapter.keypoints || []).slice(0, 4),
        sections: (chapter.sections || []).length,
        questionCount: related.length,
        progress: db.chapter_progress[chapter.id] || {},
        questionSeen: seen,
        questionRight: right,
        questionWrong: wrong,
        mastery: related.length ? Math.round((100 * right) / related.length) : 0,
      };
    });
}

/* ------------------------------------------------------------------ stats */
function buildStats() {
  const attempts = db.attempts;
  const states = Object.values(db.qstate);
  const totalQuestions = Object.keys(questions).length || 1;
  const byChapter = {};
  const chapterList = Object.values(chapters);
  chapterList.forEach((chapter) => {
    byChapter[chapter.id] = {
      cid: chapter.id,
      title: chapter.title,
      module: chapter.module,
      answered: 0,
      correct: 0,
      totalQuestions: relatedQuestions(chapter.id).length,
      seenQuestions: 0,
    };
  });
  Object.entries(db.qstate).forEach(([qid, state]) => {
    const question = questions[qid];
    if (!question || !byChapter[question.chapter]) return;
    byChapter[question.chapter].answered += state.seen || 0;
    byChapter[question.chapter].correct += state.right || 0;
    if (state.seen) byChapter[question.chapter].seenQuestions += 1;
  });
  Object.values(byChapter).forEach((entry) => {
    entry.accuracy = entry.answered ? Math.round((100 * entry.correct) / entry.answered) : null;
  });

  const moduleStats = modules.map((module) => {
    const entries = Object.values(byChapter).filter((entry) => entry.module === module.id);
    const answered = entries.reduce((sum, entry) => sum + entry.answered, 0);
    const correct = entries.reduce((sum, entry) => sum + entry.correct, 0);
    const total = entries.reduce((sum, entry) => sum + entry.totalQuestions, 0);
    const seen = entries.reduce((sum, entry) => sum + entry.seenQuestions, 0);
    return {
      id: module.id,
      name: module.name,
      color: module.color,
      answered,
      accuracy: answered ? Math.round((100 * correct) / answered) : null,
      coverage: total ? Math.round((100 * seen) / total) : 0,
    };
  });

  const weak = Object.values(byChapter)
    .filter((entry) => entry.answered >= 3 && (entry.accuracy || 0) < 75)
    .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0) || b.answered - a.answered)
    .slice(0, 5);

  const activity = [];
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const row = db.study_days[key] || {};
    activity.push({
      day: key,
      seconds: row.seconds || 0,
      answered: row.answered || 0,
      correct: row.correct || 0,
    });
  }
  const todayRow = db.study_days[today()] || { seconds: 0, answered: 0, correct: 0 };
  const wrongRows = states
    .filter((state) => state.wrong > 0 && !state.mastered)
    .sort((a, b) => (a.next_review || "9999").localeCompare(b.next_review || "9999"));
  const due = wrongRows.filter((state) => (state.next_review || "9999") <= today()).length;
  const recentWrong = [...wrongRows]
    .sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || ""))
    .slice(0, 6)
    .map((state) => {
      const question = questions[state.qid];
      if (!question) return null;
      return {
        qid: state.qid,
        stem: question.stem.slice(0, 90),
        wrong: state.wrong,
        chapterTitle: chapters[question.chapter]?.title || "",
      };
    })
    .filter(Boolean);

  const answered = attempts.length;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const studySeconds = Object.values(db.study_days).reduce((sum, row) => sum + (row.seconds || 0), 0);
  const exerciseState = Object.values(db.exstate);
  const finishedExams = db.exams.filter((exam) => exam.finished_at);

  return {
    totals: {
      answered,
      correct,
      durationMs: attempts.reduce((sum, attempt) => sum + (attempt.duration_ms || 0), 0),
      wrong: wrongRows.length,
      exercisesSolved: exerciseState.filter((state) => state.solved).length,
      exams: finishedExams.length,
      studySeconds,
    },
    accuracy: answered ? Math.round((100 * correct) / answered) : null,
    coverage: Math.round((100 * Object.keys(db.qstate).length) / totalQuestions),
    streak: computeStreak(),
    byChapter: Object.values(byChapter),
    modules: moduleStats,
    activity,
    weakChapters: weak,
    recentWrong,
    dueReviews: due,
    wrongCount: wrongRows.length,
    bookmarkCount: states.filter((state) => state.bookmarked).length,
    exercises: {
      solved: exerciseState.filter((state) => state.solved).length,
      total: Object.keys(exercises).length,
    },
    exams: finishedExams
      .slice()
      .sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""))
      .slice(0, 10),
    today: {
      answered: todayRow.answered || 0,
      correct: todayRow.correct || 0,
      seconds: todayRow.seconds || 0,
    },
    examDate: db.settings.exam_date || "",
    daysLeft: daysLeft(db.settings.exam_date || ""),
  };
}

function computeStreak() {
  const active = new Set(
    Object.entries(db.study_days)
      .filter(([, row]) => (row.answered || 0) > 0 || (row.seconds || 0) > 60)
      .map(([day]) => day)
  );
  if (!active.size) return 0;
  let cursor = new Date();
  if (!active.has(today())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function dailyPlan(stats) {
  const goal = Number(db.settings.daily_goal || 20);
  const answeredToday = stats.today.answered;
  const actions = [];
  if (stats.dueReviews) {
    actions.push({
      kind: "review",
      title: `复习 ${stats.dueReviews} 道到期错题`,
      desc: "按遗忘曲线安排的复习，趁热打铁效果最好",
      action: "wrongbook",
    });
  }
  if (answeredToday < goal) {
    actions.push({
      kind: "practice",
      title: `完成今日 ${goal} 道练习`,
      desc: `已完成 ${answeredToday} 道，还差 ${Math.max(0, goal - answeredToday)} 道`,
      action: "practice",
    });
  }
  if (stats.weakChapters.length) {
    const chapter = stats.weakChapters[0];
    actions.push({
      kind: "chapter",
      title: `补强「${chapter.title}」`,
      desc: `当前正确率 ${chapter.accuracy}%，建议重读考点再练 10 题`,
      action: "chapter",
      chapterId: chapter.cid,
    });
  }
  const unread = chapterSummaries().filter((chapter) => !chapter.progress.read_at);
  if (unread.length) {
    const chapter = unread[0];
    actions.push({
      kind: "learn",
      title: `开始学习「${chapter.title}」`,
      desc: `约 ${chapter.minutes} 分钟 · ${chapter.sections} 个小节`,
      action: "chapter",
      chapterId: chapter.id,
    });
  }
  return { goal, answeredToday, actions: actions.slice(0, 3) };
}

/* --------------------------------------------------------------- questions */
function listQuestions(query = {}) {
  const mode = (query.mode || "chapter").toLowerCase();
  let pool = [];
  if (mode === "wrong") {
    pool = Object.values(db.qstate)
      .filter((state) => state.wrong > 0 && !state.mastered)
      .map((state) => questions[state.qid])
      .filter(Boolean);
  } else if (mode === "bookmark") {
    pool = Object.values(db.qstate)
      .filter((state) => state.bookmarked)
      .map((state) => questions[state.qid])
      .filter(Boolean);
  } else if (mode === "random") {
    pool = Object.values(questions);
  } else {
    pool = relatedQuestions(query.chapter);
  }
  if (query.difficulty && query.difficulty !== "all") {
    pool = pool.filter((q) => String(q.difficulty || 1) === String(query.difficulty));
  }
  if (String(query.unseen || "").toLowerCase() === "true" || query.unseen === "1") {
    const unseen = pool.filter((q) => !db.qstate[q.id]?.seen);
    if (unseen.length) pool = unseen;
  }
  const limit = Math.max(1, Math.min(Number(query.limit || 10), 100));
  const ordered = query.order === "sequence" ? [...pool].sort((a, b) => a.id.localeCompare(b.id)) : shuffle(pool);
  const items = ordered.slice(0, limit).map((question) => ({
    ...publicQuestion(question),
    state: publicState(db.qstate[question.id]),
    publicBasic: isPublicBasic(question),
  }));
  return { items, total: pool.length, mode, chapter: query.chapter || null };
}

function answerQuestion(payload) {
  const qid = payload.questionId;
  const question = questions[qid];
  if (!question) throw new Error("题目不存在");
  const choice = Number(payload.choice);
  const correct = choice === question.answer;
  const state = qstate(qid);
  state.seen += 1;
  state.last_seen = nowISO();
  state.last_result = correct ? 1 : 0;
  if (correct) {
    state.right += 1;
    state.streak += 1;
    if (state.wrong > 0 && state.streak >= 2) {
      state.mastered = 1;
      state.next_review = null;
    } else if (state.next_review) {
      state.next_review = addDays(3);
    }
  } else {
    state.wrong += 1;
    state.streak = 0;
    state.mastered = 0;
    const intervals = { 1: 1, 2: 2, 3: 4 };
    state.next_review = addDays(intervals[state.wrong] || 7);
  }
  db.attempts.push({
    qid,
    kind: payload.kind || "practice",
    choice,
    correct: correct ? 1 : 0,
    duration_ms: Number(payload.durationMs || 0),
    created_at: nowISO(),
    context: payload.context || "practice",
  });
  const day = (db.study_days[today()] ||= { seconds: 0, answered: 0, correct: 0 });
  day.answered += 1;
  day.correct += correct ? 1 : 0;
  persist();
  return {
    correct,
    question: fullQuestion(question),
    state: publicState(state),
  };
}

/* ---------------------------------------------------------------- exercises */
function exerciseSummary() {
  const items = Object.values(exercises).map((exercise) => {
    const state = db.exstate[exercise.id] || {};
    return {
      id: exercise.id,
      title: exercise.title,
      chapter: exercise.chapter,
      chapterTitle: chapters[exercise.chapter]?.title || "",
      difficulty: exercise.difficulty || 1,
      level: exercise.level || "basic",
      points: exercise.points || 15,
      tags: exercise.tags || [],
      testCount: (exercise.tests || []).length,
      state: {
        attempts: state.attempts || 0,
        solved: Boolean(state.solved),
        bestScore: state.best_score || 0,
        lastPassed: state.passed || 0,
      },
    };
  });
  items.sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  return { items, total: items.length, solved: items.filter((item) => item.state.solved).length };
}

function exercisePublic(exercise) {
  return {
    id: exercise.id,
    chapter: exercise.chapter,
    title: exercise.title,
    difficulty: exercise.difficulty || 1,
    level: exercise.level || "basic",
    points: exercise.points || 15,
    statement: exercise.statement,
    inputSpec: exercise.inputSpec || "",
    outputSpec: exercise.outputSpec || "",
    samples: exercise.samples || [],
    starter: exercise.starter || "",
    hints: exercise.hints || [],
    tags: exercise.tags || [],
    knowledge: exercise.knowledge || [],
    testCount: (exercise.tests || []).length,
  };
}

function normalizeOutput(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function numbers(text) {
  const matches = String(text || "").match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  return matches ? matches.map(Number) : null;
}

function compareOutput(expected, actual, mode = "exact") {
  const exp = normalizeOutput(expected);
  const got = normalizeOutput(actual);
  if (exp === got) return true;
  if (mode === "float") {
    const a = numbers(exp);
    const b = numbers(got);
    if (!a || !b || a.length !== b.length) return false;
    return a.every((value, index) => Math.abs(value - b[index]) <= 1e-6 * Math.max(1, Math.abs(value)));
  }
  if (mode === "ignore_case") return exp.toLowerCase() === got.toLowerCase();
  return false;
}

async function gradeCode(code, tests) {
  const results = [];
  let passed = 0;
  let duration = 0;
  for (let index = 0; index < tests.length; index += 1) {
    const test = tests[index];
    let outcome;
    try {
      outcome = await runCode(code, test.stdin || "", test.files || {}, 8);
    } catch (error) {
      outcome = {
        ok: false,
        stdout: "",
        stderr: String(error?.message || error),
        durationMs: 0,
        timedOut: false,
      };
    }
    duration += outcome.durationMs || 0;
    const ok = Boolean(outcome.ok) && compareOutput(test.stdout || "", outcome.stdout, test.mode || "exact");
    if (ok) passed += 1;
    results.push({
      index: index + 1,
      name: test.name || `测试点 ${index + 1}`,
      passed: ok,
      stdin: test.stdin || "",
      expected: test.stdout || "",
      actual: outcome.stdout || "",
      stderr: outcome.stderr || "",
      ok: Boolean(outcome.ok),
      timedOut: Boolean(outcome.timedOut),
      durationMs: outcome.durationMs || 0,
      hidden: Boolean(test.hidden),
      files: Object.keys(test.files || {}),
    });
  }
  return {
    passed,
    total: tests.length,
    allPassed: passed === tests.length,
    results,
    durationMs: duration,
  };
}

async function runExercise(eid, payload) {
  const exercise = exercises[eid];
  if (!exercise) throw new Error("代码题不存在");
  const code = String(payload.code || "");
  if (!code.trim()) throw new Error("请先编写代码");
  let tests = exercise.tests || [];
  if ((payload.scope || "all") === "sample") {
    const samples = exercise.samples || [];
    tests = samples.map((sample, index) => ({
      name: sample.name || "样例",
      stdin: sample.stdin || "",
      stdout: sample.stdout || "",
      mode: sample.mode || "exact",
      files: sample.files || {},
      index,
    }));
    if (!tests.length) tests = (exercise.tests || []).slice(0, 1);
  }
  const result = await gradeCode(code, tests);
  const points = Number(exercise.points || 15);
  const score = Math.round((points * result.passed) / Math.max(1, result.total));
  const state = db.exstate[eid] || { eid, attempts: 0, passed: 0, best_score: 0, last_code: "", last_at: null, solved: 0 };
  state.attempts = (state.attempts || 0) + 1;
  state.passed = result.passed;
  state.best_score = Math.max(state.best_score || 0, score);
  state.last_code = code;
  state.last_at = nowISO();
  if (result.allPassed) state.solved = 1;
  db.exstate[eid] = state;
  persist();
  return {
    ...result,
    score,
    points,
    state,
    solution: result.allPassed ? exercise.solution || "" : "",
  };
}

/* ------------------------------------------------------------------- exam */
function getPaper(key) {
  return meta?.papers?.[key];
}

function startExam(paperKey) {
  const paper = getPaper(paperKey);
  if (!paper) throw new Error("试卷不存在");
  const used = new Set();
  const chosen = [];
  Object.entries(paper.counts || {}).forEach(([cid, count]) => {
    const pool = shuffle(relatedQuestions(cid).filter((q) => !used.has(q.id)));
    pool.slice(0, count).forEach((question) => {
      used.add(question.id);
      chosen.push(question);
    });
  });
  const tasks = [];
  (paper.codingLevels || []).forEach((level) => {
    const pool = shuffle(Object.values(exercises).filter((exercise) => exercise.level === level));
    if (pool.length) tasks.push(pool[0]);
  });
  const sessionId = `ex-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const session = {
    id: sessionId,
    paper: paperKey,
    questionIds: chosen.map((question) => question.id),
    taskIds: tasks.map((exercise) => exercise.id),
    startedAt: new Date().toISOString(),
  };
  examCache.set(sessionId, session);
  try {
    sessionStorage.setItem(`pyl2-exam-${sessionId}`, JSON.stringify(session));
  } catch {
    /* private mode */
  }
  return {
    sessionId,
    paper: {
      key: paperKey,
      title: paper.title || "模拟考试",
      duration: paper.duration || 120,
      choicePoints: paper.choicePoints || 1,
      totalChoice: chosen.length,
      codingLevels: paper.codingLevels || [],
    },
    questions: chosen.map((question, index) => ({
      ...publicQuestion(question),
      number: index + 1,
      publicBasic: isPublicBasic(question),
    })),
    tasks: tasks.map((exercise, index) => ({
      ...exercisePublic(exercise),
      number: index + 1,
    })),
    startedAt: new Date().toISOString(),
  };
}

function getSession(sessionId) {
  if (examCache.has(sessionId)) return examCache.get(sessionId);
  try {
    const raw = sessionStorage.getItem(`pyl2-exam-${sessionId}`);
    if (raw) {
      const session = JSON.parse(raw);
      examCache.set(sessionId, session);
      return session;
    }
  } catch {
    /* ignore */
  }
  throw new Error("考试会话不存在或已过期");
}

async function submitExam(payload) {
  const session = getSession(payload.sessionId);
  const paper = getPaper(session.paper) || {};
  const existing = db.exams.find((exam) => exam.id === session.id && exam.finished_at);
  if (existing) return { alreadySubmitted: true, result: existing.detail, score: existing.score };

  const answers = payload.answers || {};
  const codes = payload.codes || {};
  const choiceItems = [];
  let choiceCorrect = 0;
  for (const qid of session.questionIds) {
    const question = questions[qid];
    if (!question) continue;
    const raw = answers[qid];
    const choice = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    const correct = choice === question.answer;
    if (correct) choiceCorrect += 1;
    if (choice !== null) {
      answerQuestion({
        questionId: qid,
        choice,
        durationMs: 0,
        context: "exam",
        kind: "exam",
      });
    }
    choiceItems.push({
      qid,
      chapter: question.chapter,
      stem: question.stem,
      options: question.options,
      chosen: choice,
      answer: question.answer,
      correct,
      explanation: question.explanation || "",
      code: question.code || null,
    });
  }

  const codingItems = [];
  let codingScore = 0;
  let codingMax = 0;
  for (const eid of session.taskIds) {
    const exercise = exercises[eid];
    if (!exercise) continue;
    const points = Number(exercise.points || 15);
    codingMax += points;
    const code = String(codes[eid] || "");
    if (!code.trim()) {
      codingItems.push({
        eid,
        title: exercise.title,
        points,
        awarded: 0,
        passed: 0,
        total: (exercise.tests || []).length,
        unanswered: true,
        results: [],
      });
      continue;
    }
    const result = await gradeCode(code, exercise.tests || []);
    const awarded = Math.round((points * result.passed) / Math.max(1, result.total));
    codingScore += awarded;
    const state = db.exstate[eid] || { eid, attempts: 0, best_score: 0, solved: 0 };
    state.attempts = (state.attempts || 0) + 1;
    state.passed = result.passed;
    state.best_score = Math.max(state.best_score || 0, awarded);
    state.last_code = code;
    state.last_at = nowISO();
    if (result.allPassed) state.solved = 1;
    db.exstate[eid] = state;
    codingItems.push({
      eid,
      title: exercise.title,
      points,
      awarded,
      passed: result.passed,
      total: result.total,
      results: result.results,
      solution: exercise.solution || "",
    });
  }

  const choiceMax = choiceItems.length * (paper.choicePoints || 1);
  const totalMax = choiceMax + codingMax;
  const score = totalMax ? round((100 * (choiceCorrect * (paper.choicePoints || 1) + codingScore)) / totalMax, 1) : 0;
  const byChapter = {};
  choiceItems.forEach((item) => {
    if (!byChapter[item.chapter]) {
      byChapter[item.chapter] = {
        cid: item.chapter,
        title: chapters[item.chapter]?.title || item.chapter,
        correct: 0,
        total: 0,
      };
    }
    byChapter[item.chapter].total += 1;
    if (item.correct) byChapter[item.chapter].correct += 1;
  });
  const duration = Number(payload.durationSec || 0);
  const detail = {
    paper: session.paper,
    paperTitle: paper.title || "模拟考试",
    choice: {
      correct: choiceCorrect,
      total: choiceItems.length,
      score: choiceCorrect * (paper.choicePoints || 1),
      maxScore: choiceMax,
      items: choiceItems,
    },
    coding: { score: codingScore, maxScore: codingMax, items: codingItems },
    byChapter: Object.values(byChapter).sort((a, b) => a.title.localeCompare(b.title)),
    durationSec: duration,
    passScore: paper.passScore || 60,
  };
  db.exams.push({
    id: session.id,
    blueprint: session.paper,
    started_at: session.startedAt,
    finished_at: nowISO(),
    score,
    detail,
    duration_sec: duration,
  });
  persist();
  examCache.delete(session.id);
  try {
    sessionStorage.removeItem(`pyl2-exam-${session.id}`);
  } catch {
    /* ignore */
  }
  return { sessionId: session.id, score, passed: score >= (paper.passScore || 60), detail };
}

/* --------------------------------------------------------------------- api */
export const api = {
  async bootstrap() {
    await ensureContent();
    const stats = buildStats();
    return {
      app: {
        title: meta.title || "Python 二级通关",
        subtitle: meta.subtitle || "",
        examInfo: meta.examInfo || {},
        version: meta.version || "1.0.0",
      },
      settings: { ...db.settings },
      stats,
      chapters: chapterSummaries(),
      modules,
      papers: Object.entries(meta.papers || {}).map(([key, paper]) => ({
        key,
        title: paper.title || key,
        duration: paper.duration || 120,
        description: paper.description || "",
        choiceCount: Object.values(paper.counts || {}).reduce((sum, count) => sum + count, 0),
        codingLevels: paper.codingLevels || [],
      })),
      today: stats.today,
      plan: dailyPlan(stats),
    };
  },

  async stats() {
    await ensureContent();
    return buildStats();
  },

  async chapters() {
    await ensureContent();
    return { items: chapterSummaries() };
  },

  async chapter(cid) {
    await ensureContent();
    const chapter = chapters[cid];
    if (!chapter) throw new Error("章节不存在");
    const states = db.qstate;
    return {
      ...chapter,
      progress: db.chapter_progress[cid] || {},
      questions: relatedQuestions(cid).map((question) => ({
        ...publicQuestion(question),
        state: publicState(states[question.id]),
        publicBasic: isPublicBasic(question),
      })),
    };
  },

  async markChapter(cid, section, seconds) {
    await ensureContent();
    if (!chapters[cid]) throw new Error("章节不存在");
    const progress = (db.chapter_progress[cid] ||= { read_at: null, read_seconds: 0, last_section: 0 });
    progress.read_at = nowISO();
    progress.read_seconds += Math.max(0, Math.min(Number(seconds || 0), 600));
    progress.last_section = Math.max(progress.last_section || 0, Number(section || 0));
    persist();
    return { ok: true };
  },

  async questions(params) {
    await ensureContent();
    return listQuestions(params || {});
  },

  async answer(questionId, choice, durationMs, context = "practice") {
    await ensureContent();
    return answerQuestion({ questionId, choice, durationMs, context });
  },

  async bookmark(qid, value) {
    await ensureContent();
    if (!questions[qid]) throw new Error("题目不存在");
    qstate(qid).bookmarked = value ? 1 : 0;
    persist();
    return { bookmarked: Boolean(value) };
  },

  async wrongbook() {
    await ensureContent();
    const rows = Object.values(db.qstate)
      .filter((state) => state.wrong > 0 && !state.mastered)
      .sort((a, b) => (a.next_review || "9999").localeCompare(b.next_review || "9999"));
    const items = rows
      .map((state) => {
        const question = questions[state.qid];
        if (!question) return null;
        return {
          ...publicQuestion(question),
          state: publicState(state),
          lastResult: state.last_result,
          lastSeen: state.last_seen,
          nextReview: state.next_review,
          chapterTitle: chapters[question.chapter]?.title || "",
        };
      })
      .filter(Boolean);
    return {
      items,
      total: items.length,
      due: items.filter((item) => (item.nextReview || "9999") <= today()).length,
    };
  },

  async removeWrong(qid) {
    await ensureContent();
    if (db.qstate[qid]) db.qstate[qid].mastered = 1;
    persist();
    return { ok: true };
  },

  async bookmarks() {
    await ensureContent();
    const items = Object.values(db.qstate)
      .filter((state) => state.bookmarked)
      .map((state) => {
        const question = questions[state.qid];
        if (!question) return null;
        return {
          ...publicQuestion(question),
          state: publicState(state),
          chapterTitle: chapters[question.chapter]?.title || "",
        };
      })
      .filter(Boolean);
    return { items, total: items.length };
  },

  async exercises() {
    await ensureContent();
    return exerciseSummary();
  },

  async exercise(eid) {
    await ensureContent();
    const exercise = exercises[eid];
    if (!exercise) throw new Error("代码题不存在");
    return {
      ...exercisePublic(exercise),
      state: db.exstate[eid] || {
        eid,
        attempts: 0,
        passed: 0,
        best_score: 0,
        last_code: "",
        last_at: null,
        solved: 0,
      },
      chapterTitle: chapters[exercise.chapter]?.title || "",
    };
  },

  async runExercise(eid, code, scope = "all") {
    await ensureContent();
    return runExercise(eid, { code, scope });
  },

  async solution(eid) {
    await ensureContent();
    const exercise = exercises[eid];
    if (!exercise) throw new Error("代码题不存在");
    return { solution: exercise.solution || "", analysis: exercise.analysis || "" };
  },

  async run(code, stdin = "") {
    await ensureContent();
    return runCode(code, stdin, {}, 8);
  },

  async startExam(paper) {
    await ensureContent();
    return startExam(paper);
  },

  async submitExam(sessionId, answers, codes, durationSec) {
    await ensureContent();
    return submitExam({ sessionId, answers, codes, durationSec });
  },

  async examResult(id) {
    await ensureContent();
    const exam = db.exams.find((item) => item.id === id);
    if (!exam || !exam.detail) throw new Error("成绩不存在");
    return { sessionId: id, score: exam.score, detail: exam.detail };
  },

  async cheatsheet() {
    await ensureContent();
    return cheatsheet;
  },

  async saveSettings(patch) {
    await ensureContent();
    const allowed = ["theme", "exam_date", "daily_goal", "reduce_motion", "nickname", "onboarded"];
    const next = { ...db.settings };
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    });
    if (next.daily_goal) next.daily_goal = String(Math.max(5, Math.min(200, Number(next.daily_goal) || 20)));
    if (next.exam_date) {
      const parsed = new Date(`${next.exam_date}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) throw new Error("考试日期格式应为 YYYY-MM-DD");
    }
    db.settings = next;
    persist();
    return { settings: { ...db.settings } };
  },

  async heartbeat(seconds) {
    const amount = Math.max(0, Math.min(Number(seconds || 0), 300));
    if (!amount) return { ok: true };
    const row = (db.study_days[today()] ||= { seconds: 0, answered: 0, correct: 0 });
    row.seconds += amount;
    persist();
    return { ok: true };
  },

  async reset() {
    await ensureContent();
    db.qstate = {};
    db.attempts = [];
    db.exstate = {};
    db.exams = [];
    db.study_days = {};
    db.chapter_progress = {};
    persist();
    return { ok: true };
  },

  async exportData() {
    await ensureContent();
    return {
      app: "PythonLevel2Tutor",
      version: VERSION,
      exported_at: nowISO(),
      settings: { ...db.settings },
      qstate: Object.values(db.qstate),
      attempts: db.attempts,
      exstate: Object.values(db.exstate),
      exams: db.exams.map((exam) => ({
        ...exam,
        detail: exam.detail ? JSON.stringify(exam.detail) : exam.detail,
      })),
      study_days: Object.entries(db.study_days).map(([day, row]) => ({
        day,
        seconds: row.seconds || 0,
        answered: row.answered || 0,
        correct: row.correct || 0,
      })),
      chapter_progress: Object.entries(db.chapter_progress).map(([cid, row]) => ({
        cid,
        read_at: row.read_at || null,
        read_seconds: row.read_seconds || 0,
        last_section: row.last_section || 0,
      })),
    };
  },

  async importData(payload) {
    if (payload?.app !== "PythonLevel2Tutor") throw new Error("不是本程序导出的备份文件");
    await ensureContent();
    const toObject = (value, key) => {
      if (Array.isArray(value)) {
        return Object.fromEntries(value.filter((row) => row && row[key]).map((row) => [row[key], row]));
      }
      return value || {};
    };
    const parseExam = (exam) => {
      if (exam && typeof exam.detail === "string") {
        try {
          return { ...exam, detail: JSON.parse(exam.detail) };
        } catch {
          return { ...exam, detail: null };
        }
      }
      return exam;
    };
    db = {
      ...defaultDb(),
      ...payload,
      settings: { ...DEFAULT_SETTINGS, ...(payload.settings || {}) },
      qstate: toObject(payload.qstate, "qid"),
      attempts: payload.attempts || [],
      exstate: toObject(payload.exstate, "eid"),
      exams: (payload.exams || []).map(parseExam),
      study_days: toObject(payload.study_days, "day"),
      chapter_progress: toObject(payload.chapter_progress, "cid"),
    };
    persist();
    return { ok: true };
  },
};
