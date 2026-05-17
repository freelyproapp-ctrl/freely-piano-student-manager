const STORAGE_KEY = "pianoStudioManager.v3";
const SESSION_KEY = "pianoStudioManager.session";
const DEFAULT_STUDIO_NAME = "freelyピアノ教室";

const COURSE_PRESETS = [
  { id: "monthly-beyer", name: "対面月謝 バイエル程度", fee: 6600 },
  { id: "monthly-burgmuller", name: "対面月謝 ブルグミュラー程度", fee: 7700 },
  { id: "monthly-sonatine", name: "対面月謝 ソナチネ程度", fee: 8800 },
  { id: "monthly-sonata", name: "対面月謝 ソナタ・コード譜程度", fee: 9900 },
  { id: "single-60", name: "1レッスン 60分 対面", fee: 4400 },
  { id: "single-60-visit", name: "1レッスン 60分 出張", fee: 5500 },
  { id: "single-80", name: "1レッスン 80分 対面", fee: 6600 },
  { id: "ticket-beyer", name: "チケット バイエル程度 45分 5回", fee: 11000 },
  { id: "ticket-burgmuller", name: "チケット ブルグミュラー程度 45分 5回", fee: 13200 },
  { id: "ticket-burgmuller-visit", name: "チケット ブルグミュラー程度 出張 45分 5回", fee: 14300 },
  { id: "ticket-sonatine", name: "チケット ソナチネ以上 50分 4回", fee: 12100 },
  { id: "ticket-sonatine-visit", name: "チケット ソナチネ以上 出張 50分 4回", fee: 13200 },
  { id: "video-beyer", name: "動画練習サポート バイエル 1回", fee: 1100 },
  { id: "video-burgmuller", name: "動画練習サポート ブルグミュラー 1回", fee: 1100 },
  { id: "video-sonatine", name: "動画練習サポート ソナチネ 1回", fee: 1650 },
  { id: "video-sonata", name: "動画練習サポート ソナタ以上 1回", fee: 1650 },
];

const STUDENT_NAMES = [
  ["青木 花", "小2", "火", "15:30", "monthly-beyer"],
  ["石川 悠真", "小4", "水", "16:00", "monthly-burgmuller"],
  ["上田 紬", "年長", "月", "15:00", "monthly-beyer"],
  ["大野 莉子", "小1", "金", "16:30", "monthly-beyer"],
  ["加藤 湊", "小5", "土", "10:00", "monthly-sonatine"],
  ["佐々木 杏", "中1", "木", "18:00", "monthly-burgmuller"],
  ["高橋 澪", "小3", "火", "17:00", "monthly-beyer"],
  ["中村 凛", "小6", "土", "11:00", "monthly-sonata"],
  ["藤井 奏", "中2", "水", "19:00", "ticket-sonatine"],
  ["森 七海", "小2", "金", "15:30", "monthly-beyer"],
];

const app = document.querySelector("#app");
const channel = "BroadcastChannel" in window ? new BroadcastChannel("piano-studio-sync") : null;
const config = window.PIANO_APP_CONFIG || {};
const cloudEnabled = Boolean(config.supabaseUrl && config.supabaseAnonKey);

let state = createDefaultState();
let session = loadLocalSession();
let supabase = null;
let authUser = null;
let searchTerm = "";
let editingStudentId = null;
let isLoading = true;
let loadingMessage = "起動しています";
let syncMessage = cloudEnabled ? "クラウド保存を準備中です" : "デモ保存中です";

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yen(value) {
  return Number(value || 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" });
}

function createDefaultState() {
  const courses = COURSE_PRESETS.map((course) => ({ ...course }));
  const students = STUDENT_NAMES.map(([name, grade, day, startTime, courseId], index) => {
    const course = courses.find((item) => item.id === courseId);
    return {
      id: uid("student"),
      name,
      grade,
      courseId,
      lessonDay: day,
      startTime,
      fee: course.fee,
      receiptChecked: index % 3 === 0,
      receiptDate: index % 3 === 0 ? today() : "",
      receiptMemo: "",
      studioNotice: "次回までに宿題の曲を片手ずつ確認してください。",
      teacherMemo: "",
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    studioName: DEFAULT_STUDIO_NAME,
    teacher: { id: "teacher", password: "admin123" },
    courses,
    students,
    updatedAt: new Date().toISOString(),
  };
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const fresh = createDefaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  return normalizeState(JSON.parse(saved));
}

function normalizeState(saved) {
  const next = {
    ...createDefaultState(),
    ...saved,
  };
  next.courses = (next.courses || COURSE_PRESETS).map((course) => ({
    id: course.id,
    name: course.name,
    fee: Number(course.fee || 0),
  }));
  next.students = (next.students || []).map((student) => ({
    ...student,
    fee: Number(student.fee || 0),
    receiptChecked: Boolean(student.receiptChecked),
    receiptDate: student.receiptDate || "",
    receiptMemo: student.receiptMemo || "",
    studioNotice: student.studioNotice || "",
    teacherMemo: student.teacherMemo ?? student.parentMemo ?? "",
    updatedAt: student.updatedAt || new Date().toISOString(),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function loadLocalSession() {
  const saved = sessionStorage.getItem(SESSION_KEY);
  return saved ? JSON.parse(saved) : null;
}

function setSession(next) {
  session = next;
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
  render();
}

async function boot() {
  state = loadLocalState();
  registerServiceWorker();

  if (cloudEnabled) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
      supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data } = await supabase.auth.getSession();
      authUser = data.session?.user || null;
      session = authUser ? { role: "teacher", mode: "cloud" } : null;
      if (authUser) {
        await loadCloudState();
        subscribeToCloudChanges();
      }
      syncMessage = authUser ? "クラウド保存中です" : "クラウドログイン待ちです";
    } catch (error) {
      console.error(error);
      syncMessage = "クラウド接続に失敗しました。デモ保存で表示しています";
    }
  } else {
    syncMessage = "Supabase未設定のため、この端末だけのデモ保存です";
  }

  isLoading = false;
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function getCourse(courseId) {
  return state.courses.find((course) => course.id === courseId) || state.courses[0];
}

function getStudent(id) {
  return state.students.find((student) => student.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toDbCourse(course, orderIndex) {
  return {
    id: course.id,
    user_id: authUser.id,
    name: course.name,
    fee: Number(course.fee || 0),
    order_index: orderIndex,
  };
}

function toDbStudent(student, orderIndex) {
  return {
    id: student.id,
    user_id: authUser.id,
    name: student.name,
    grade: student.grade,
    course_id: student.courseId,
    lesson_day: student.lessonDay,
    start_time: student.startTime,
    fee: Number(student.fee || 0),
    receipt_checked: Boolean(student.receiptChecked),
    receipt_date: student.receiptDate || null,
    receipt_memo: student.receiptMemo || "",
    studio_notice: student.studioNotice || "",
    teacher_memo: student.teacherMemo || "",
    order_index: orderIndex,
    updated_at: student.updatedAt || new Date().toISOString(),
  };
}

function fromDbCourse(course) {
  return {
    id: course.id,
    name: course.name,
    fee: Number(course.fee || 0),
  };
}

function fromDbStudent(student) {
  return {
    id: student.id,
    name: student.name,
    grade: student.grade,
    courseId: student.course_id,
    lessonDay: student.lesson_day,
    startTime: student.start_time,
    fee: Number(student.fee || 0),
    receiptChecked: Boolean(student.receipt_checked),
    receiptDate: student.receipt_date || "",
    receiptMemo: student.receipt_memo || "",
    studioNotice: student.studio_notice || "",
    teacherMemo: student.teacher_memo || "",
    updatedAt: student.updated_at || new Date().toISOString(),
  };
}

async function loadCloudState() {
  loadingMessage = "クラウドから読み込んでいます";
  render();

  const [{ data: settings, error: settingsError }, { data: courses, error: coursesError }, { data: students, error: studentsError }] =
    await Promise.all([
      supabase.from("app_settings").select("*").eq("user_id", authUser.id).maybeSingle(),
      supabase.from("courses").select("*").eq("user_id", authUser.id).order("order_index", { ascending: true }),
      supabase.from("students").select("*").eq("user_id", authUser.id).order("order_index", { ascending: true }),
    ]);

  if (settingsError || coursesError || studentsError) {
    throw settingsError || coursesError || studentsError;
  }

  if (!settings) {
    await seedCloudState();
    return loadCloudState();
  }

  state = normalizeState({
    studioName: settings.studio_name || DEFAULT_STUDIO_NAME,
    teacher: { id: "teacher", password: "admin123" },
    courses: courses.map(fromDbCourse),
    students: students.map(fromDbStudent),
    updatedAt: settings.updated_at || new Date().toISOString(),
  });
}

async function seedCloudState() {
  const initial = loadLocalState();
  await supabase.from("app_settings").upsert({
    user_id: authUser.id,
    studio_name: initial.studioName || DEFAULT_STUDIO_NAME,
    updated_at: new Date().toISOString(),
  });
  await supabase.from("courses").upsert(initial.courses.map(toDbCourse));
  await supabase.from("students").upsert(initial.students.map(toDbStudent));
}

async function saveState(message = "保存しました") {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (cloudEnabled && supabase && authUser) {
    try {
      syncMessage = "クラウドへ保存中です";
      render();
      await saveCloudState();
      syncMessage = "クラウド保存済みです";
    } catch (error) {
      console.error(error);
      syncMessage = "クラウド保存に失敗しました。通信状態を確認してください";
    }
  }

  channel?.postMessage({ type: "state", updatedAt: state.updatedAt });
  toast(message);
  render();
}

async function saveCloudState() {
  await supabase.from("app_settings").upsert({
    user_id: authUser.id,
    studio_name: state.studioName || DEFAULT_STUDIO_NAME,
    updated_at: state.updatedAt,
  });

  await supabase.from("courses").delete().eq("user_id", authUser.id);
  await supabase.from("students").delete().eq("user_id", authUser.id);
  await supabase.from("courses").insert(state.courses.map(toDbCourse));
  await supabase.from("students").insert(state.students.map(toDbStudent));
}

function subscribeToCloudChanges() {
  supabase
    .channel("piano-studio-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "students", filter: `user_id=eq.${authUser.id}` }, refreshCloudQuietly)
    .on("postgres_changes", { event: "*", schema: "public", table: "courses", filter: `user_id=eq.${authUser.id}` }, refreshCloudQuietly)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings", filter: `user_id=eq.${authUser.id}` }, refreshCloudQuietly)
    .subscribe();
}

async function refreshCloudQuietly() {
  if (!authUser) return;
  await loadCloudState();
  syncMessage = "クラウドから最新情報を反映しました";
  render();
}

function render() {
  document.title = `${state.studioName || DEFAULT_STUDIO_NAME} 生徒管理`;

  if (isLoading) {
    app.innerHTML = shell(`<section class="login-wrap"><div class="login-card"><h2>${escapeHtml(loadingMessage)}</h2><p class="hint">少しだけお待ちください。</p></div></section>`);
    return;
  }

  if (!session) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  app.innerHTML = teacherTemplate();
  bindTeacher();
}

function shell(inner, actions = "") {
  return `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="mark" aria-hidden="true">♪</div>
          <div>
            <h1>${escapeHtml(state.studioName || DEFAULT_STUDIO_NAME)} 生徒管理</h1>
            <p class="subtle">講師専用の生徒カード管理</p>
          </div>
        </div>
        ${actions}
      </header>
      ${inner}
    </main>
    <div class="toast" id="toast"></div>
  `;
}

function loginTemplate() {
  const isCloud = cloudEnabled && supabase;
  return shell(`
    <section class="login-wrap">
      <div class="login-card">
        <h2>講師ログイン</h2>
        <form class="form" id="loginForm">
          <label class="field">
            <span>${isCloud ? "メールアドレス" : "ログインID"}</span>
            <input name="loginId" autocomplete="username" value="${isCloud ? "" : "teacher"}" />
          </label>
          <label class="field">
            <span>パスワード</span>
            <input name="password" type="password" autocomplete="current-password" value="${isCloud ? "" : "admin123"}" />
          </label>
          <div class="error" id="loginError">ログイン情報が違います。</div>
          <button class="btn" type="submit">ログイン</button>
          <p class="hint">${isCloud ? "Supabaseで登録した講師メールでログインします。" : "デモ: teacher / admin123。Supabase設定後はスマホでもクラウド保存できます。"}</p>
        </form>
      </div>
    </section>
  `);
}

function teacherTemplate() {
  const paid = state.students.filter((student) => student.receiptChecked).length;
  const unpaid = state.students.length - paid;
  const monthly = state.students.reduce((sum, student) => sum + Number(student.fee || 0), 0);
  const filtered = state.students.filter((student) => {
    const haystack = `${student.name} ${student.grade} ${student.lessonDay} ${getCourse(student.courseId).name}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  return shell(
    `
      <section class="dashboard">
        <div class="sync-banner">${escapeHtml(syncMessage)}</div>
        <div class="toolbar">
          <input id="search" placeholder="名前・学年・曜日・コースで検索" value="${escapeHtml(searchTerm)}" />
          <button class="btn secondary" id="courseSettings">コース設定</button>
          <button class="btn" id="addStudent">＋ 生徒追加</button>
        </div>
        <form class="panel studio-settings" id="studioForm">
          <label class="field">
            <span>お教室名</span>
            <input name="studioName" value="${escapeHtml(state.studioName || DEFAULT_STUDIO_NAME)}" />
          </label>
          <button class="btn secondary" type="submit">教室名を保存</button>
        </form>
        <div class="stats">
          <div class="stat"><span class="subtle">生徒数</span><strong>${state.students.length}</strong></div>
          <div class="stat"><span class="subtle">領収済み</span><strong>${paid}</strong></div>
          <div class="stat"><span class="subtle">未確認</span><strong>${unpaid}</strong></div>
          <div class="stat"><span class="subtle">月額合計</span><strong>${yen(monthly)}</strong></div>
        </div>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>生徒カード</h2>
              <p class="subtle">レッスン予定と領収状況を一覧で確認できます</p>
            </div>
          </div>
          <div class="student-grid">
            ${filtered.map(studentCardTemplate).join("") || `<p class="subtle">該当する生徒がいません。</p>`}
          </div>
        </section>
      </section>
      ${studentModalTemplate()}
      ${courseModalTemplate()}
    `,
    `<button class="btn secondary" id="logout">ログアウト</button>`,
  );
}

function studentCardTemplate(student) {
  const course = getCourse(student.courseId);
  return `
    <article class="student-card" data-student-card="${student.id}">
      <div class="card-head">
        <div>
          <div class="card-name">${escapeHtml(student.name)}</div>
          <p class="subtle">${escapeHtml(student.grade)} / ${escapeHtml(course.name)}</p>
        </div>
        <span class="badge ${student.receiptChecked ? "" : "warn"}">${student.receiptChecked ? "領収済み" : "未確認"}</span>
      </div>
      <div class="meta">
        <div><span>レッスン</span>${escapeHtml(student.lessonDay)}曜 ${escapeHtml(student.startTime)}</div>
        <div><span>レッスン費</span>${yen(student.fee)}</div>
        <div><span>領収日</span>${student.receiptDate || "未記入"}</div>
        <div><span>講師メモ</span>${escapeHtml(student.teacherMemo || "なし")}</div>
      </div>
      <div class="card-actions">
        <button class="btn secondary" data-edit="${student.id}">編集</button>
        <button class="btn danger" data-delete="${student.id}">削除</button>
      </div>
    </article>
  `;
}

function studentModalTemplate() {
  const student = editingStudentId ? getStudent(editingStudentId) : emptyStudent();
  const title = editingStudentId ? "生徒カード編集" : "生徒追加";
  return `
    <div class="overlay" id="studentOverlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="btn icon secondary" data-close-modal type="button">×</button>
        </div>
        <form class="form" id="studentForm">
          <div class="form-grid">
            <label class="field"><span>名前</span><input name="name" required value="${escapeHtml(student.name)}" /></label>
            <label class="field"><span>学年</span><input name="grade" required value="${escapeHtml(student.grade)}" /></label>
            <label class="field">
              <span>レッスンコース</span>
              <select name="courseId">${state.courses.map((course) => `<option value="${course.id}" ${course.id === student.courseId ? "selected" : ""}>${escapeHtml(course.name)}</option>`).join("")}</select>
            </label>
            <label class="field"><span>レッスン費</span><input name="fee" type="number" min="0" step="100" value="${student.fee}" /></label>
            <label class="field"><span>曜日</span><select name="lessonDay">${["月", "火", "水", "木", "金", "土", "日"].map((day) => `<option ${day === student.lessonDay ? "selected" : ""}>${day}</option>`).join("")}</select></label>
            <label class="field"><span>開始時間</span><input name="startTime" type="time" value="${escapeHtml(student.startTime)}" /></label>
            <label class="check-row full"><input name="receiptChecked" type="checkbox" ${student.receiptChecked ? "checked" : ""} /><span class="check-label">レッスン費をお預かり済み</span></label>
            <label class="field"><span>領収日</span><input name="receiptDate" type="date" value="${escapeHtml(student.receiptDate)}" /></label>
            <label class="field"><span>領収メモ</span><input name="receiptMemo" value="${escapeHtml(student.receiptMemo)}" /></label>
            <label class="field full"><span>お教室からの案内事項</span><textarea name="studioNotice">${escapeHtml(student.studioNotice)}</textarea></label>
            <label class="field full"><span>講師メモ</span><textarea name="teacherMemo">${escapeHtml(student.teacherMemo || "")}</textarea></label>
          </div>
          <button class="btn" type="submit">保存</button>
        </form>
      </div>
    </div>
  `;
}

function courseModalTemplate() {
  return `
    <div class="overlay" id="courseOverlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>レッスンコース設定</h2>
            <p class="subtle">案内資料の金額に合わせて編集できます</p>
          </div>
          <button class="btn icon secondary" data-close-modal type="button">×</button>
        </div>
        <form class="form" id="courseForm">
          <div class="course-list">
            ${state.courses
              .map(
                (course) => `
                <div class="course-row" data-course-row="${course.id}">
                  <label><span>コース名</span><input name="name-${course.id}" value="${escapeHtml(course.name)}" /></label>
                  <label><span>料金</span><input name="fee-${course.id}" type="number" min="0" step="100" value="${course.fee}" /></label>
                  <button class="btn danger" type="button" data-delete-course="${course.id}">削除</button>
                </div>
              `,
              )
              .join("")}
          </div>
          <div class="card-actions">
            <button class="btn secondary" type="button" id="addCourse">＋ コース追加</button>
            <button class="btn" type="submit">保存</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function emptyStudent() {
  const course = state.courses[0];
  return {
    id: uid("student"),
    name: "",
    grade: "",
    courseId: course.id,
    lessonDay: "月",
    startTime: "15:00",
    fee: course.fee,
    receiptChecked: false,
    receiptDate: "",
    receiptMemo: "",
    studioNotice: "",
    teacherMemo: "",
  };
}

function bindLogin() {
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const loginId = data.get("loginId").trim();
    const password = data.get("password").trim();
    const error = document.querySelector("#loginError");

    if (cloudEnabled && supabase) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: loginId,
        password,
      });
      if (loginError) {
        error.classList.add("show");
        return;
      }
      authUser = loginData.user;
      session = { role: "teacher", mode: "cloud" };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      await loadCloudState();
      subscribeToCloudChanges();
      syncMessage = "クラウド保存中です";
      render();
      return;
    }

    if (loginId === state.teacher.id && password === state.teacher.password) {
      setSession({ role: "teacher", mode: "local" });
      return;
    }

    error.classList.add("show");
  });
}

function bindTeacher() {
  document.querySelector("#logout").addEventListener("click", logout);
  document.querySelector("#search").addEventListener("input", (event) => {
    searchTerm = event.target.value;
    render();
  });
  document.querySelector("#addStudent").addEventListener("click", () => openStudentModal(null));
  document.querySelector("#courseSettings").addEventListener("click", openCourseModal);
  document.querySelector("#studioForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.studioName = data.get("studioName").trim() || DEFAULT_STUDIO_NAME;
    await saveState("教室名を保存しました");
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openStudentModal(button.dataset.edit));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = getStudent(button.dataset.delete);
      if (!confirm(`${student.name}さんのカードを削除しますか？`)) return;
      state.students = state.students.filter((item) => item.id !== student.id);
      await saveState("生徒カードを削除しました");
    });
  });

  bindStudentModal();
  bindCourseModal();
}

async function logout() {
  if (cloudEnabled && supabase) await supabase.auth.signOut();
  authUser = null;
  setSession(null);
}

function openStudentModal(id) {
  editingStudentId = id;
  render();
  document.querySelector("#studentOverlay").classList.add("show");
  document.querySelector("#studentOverlay").setAttribute("aria-hidden", "false");
}

function bindStudentModal() {
  const overlay = document.querySelector("#studentOverlay");
  overlay.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  const courseSelect = overlay.querySelector("[name='courseId']");
  const feeInput = overlay.querySelector("[name='fee']");
  courseSelect.addEventListener("change", () => {
    feeInput.value = getCourse(courseSelect.value).fee;
  });

  overlay.querySelector("#studentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      id: editingStudentId || uid("student"),
      name: data.get("name").trim(),
      grade: data.get("grade").trim(),
      courseId: data.get("courseId"),
      lessonDay: data.get("lessonDay"),
      startTime: data.get("startTime"),
      fee: Number(data.get("fee")),
      receiptChecked: data.get("receiptChecked") === "on",
      receiptDate: data.get("receiptDate"),
      receiptMemo: data.get("receiptMemo").trim(),
      studioNotice: data.get("studioNotice").trim(),
      teacherMemo: data.get("teacherMemo").trim(),
      updatedAt: new Date().toISOString(),
    };

    if (next.receiptChecked && !next.receiptDate) next.receiptDate = today();

    if (editingStudentId) {
      state.students = state.students.map((student) => (student.id === editingStudentId ? next : student));
    } else {
      state.students = [...state.students, next];
    }
    editingStudentId = null;
    await saveState("生徒カードを保存しました");
  });
}

function openCourseModal() {
  document.querySelector("#courseOverlay").classList.add("show");
  document.querySelector("#courseOverlay").setAttribute("aria-hidden", "false");
}

function bindCourseModal() {
  const overlay = document.querySelector("#courseOverlay");
  overlay.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  overlay.querySelector("#addCourse").addEventListener("click", async () => {
    state.courses.push({ id: uid("course"), name: "新しいコース", fee: 0 });
    await saveState("コースを追加しました");
    setTimeout(openCourseModal, 0);
  });

  overlay.querySelectorAll("[data-delete-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.courses.length <= 1) {
        alert("コースは1つ以上必要です。");
        return;
      }
      const courseId = button.dataset.deleteCourse;
      const fallback = state.courses.find((course) => course.id !== courseId);
      state.courses = state.courses.filter((course) => course.id !== courseId);
      state.students = state.students.map((student) =>
        student.courseId === courseId ? { ...student, courseId: fallback.id, fee: fallback.fee, updatedAt: new Date().toISOString() } : student,
      );
      await saveState("コースを削除しました");
      setTimeout(openCourseModal, 0);
    });
  });

  overlay.querySelector("#courseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.courses = state.courses.map((course) => ({
      ...course,
      name: data.get(`name-${course.id}`).trim() || course.name,
      fee: Number(data.get(`fee-${course.id}`) || 0),
    }));
    await saveState("コース設定を保存しました");
  });
}

function closeModals() {
  editingStudentId = null;
  document.querySelectorAll(".overlay").forEach((overlay) => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  });
}

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 1800);
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue || (cloudEnabled && authUser)) return;
  state = JSON.parse(event.newValue);
  render();
});

channel?.addEventListener("message", (event) => {
  if (event.data?.type !== "state" || (cloudEnabled && authUser)) return;
  state = loadLocalState();
  render();
});

boot();
