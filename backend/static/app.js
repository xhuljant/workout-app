// Front-end logic for the login / register screen.
//
// Milestone 1 goal: prove the browser can create an account and log in against
// the FastAPI backend, then call a *protected* endpoint (/api/auth/me) with the
// returned token.

// The API is served by the same server as this page, so we can use a relative
// path and never deal with CORS.
const API = "/api/auth";

// --- Token storage -------------------------------------------------------
// For this first milestone we keep tokens in localStorage so a page refresh
// stays logged in. NOTE: any JavaScript on the page can read localStorage, so
// before this app is ever exposed beyond your private Tailscale network we may
// move the refresh token into an httpOnly cookie. Fine for now.
const store = {
  get access() { return localStorage.getItem("access_token"); },
  get refresh() { return localStorage.getItem("refresh_token"); },
  set({ access_token, refresh_token }) {
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("refresh_token", refresh_token);
  },
  clear() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },
};

// --- Elements ------------------------------------------------------------
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const tabsEl = document.querySelector(".tabs");
const nameField = document.getElementById("name-field");
const form = document.getElementById("auth-form");
const submitBtn = document.getElementById("submit");
const messageEl = document.getElementById("message");
const home = document.getElementById("home");
const whoEl = document.getElementById("who");
const settingsBtn = document.getElementById("settings-btn");
const logoutBtn = document.getElementById("logout");
const passwordInput = document.getElementById("password");
const routineList = document.getElementById("routine-list");
const routineEmpty = document.getElementById("routine-empty");
const newFolderBtn = document.getElementById("new-folder-btn");
const editRoutinesBtn = document.getElementById("edit-routines-btn");
const routineFolderSelect = document.getElementById("routine-folder");

// Exercises sub-view
const exercisesBtn = document.getElementById("exercises");
const exercisesView = document.getElementById("exercises-view");
const exercisesBack = document.getElementById("exercises-back");
const exerciseSearch = document.getElementById("exercise-search");
const filterEquipmentSel = document.getElementById("filter-equipment");
const filterMuscleSel = document.getElementById("filter-muscle");
const exerciseStatus = document.getElementById("exercise-status");
const exerciseListEl = document.getElementById("exercise-list");
const exerciseAddBtn = document.getElementById("exercise-add-btn");
const exerciseCreateView = document.getElementById("exercise-create-view");
const exerciseCreateBackBtn = document.getElementById("exercise-create-back");
const addExerciseForm = document.getElementById("add-exercise-form");
const addExerciseMessage = document.getElementById("add-exercise-message");
const addExerciseSubmit = document.getElementById("add-exercise-submit");

// Active workout sub-view
const startEmptyBtn = document.getElementById("start-empty");
const startEmptyLabelEl = document.getElementById("start-empty-label");
const startEmptyTimeEl = document.getElementById("start-empty-time");
const workoutView = document.getElementById("workout-view");
const workoutBack = document.getElementById("workout-back");
const workoutDurationEl = document.getElementById("workout-duration");
const workoutVolumeEl = document.getElementById("workout-volume");
const workoutSetsEl = document.getElementById("workout-sets");
const workoutExercisesEl = document.getElementById("workout-exercises");
const workoutEmptyEl = document.getElementById("workout-empty");
const workoutAddExerciseBtn = document.getElementById("workout-add-exercise");
const workoutFinishBtn = document.getElementById("workout-finish");
const workoutDiscardBtn = document.getElementById("workout-discard");
const toastEl = document.getElementById("toast");

// Rest countdown bar
const restTimerEl = document.getElementById("rest-timer");
const restProgressEl = document.getElementById("rest-progress");
const restTimeEl = document.getElementById("rest-time");
const restMinusBtn = document.getElementById("rest-minus");
const restPlusBtn = document.getElementById("rest-plus");
const restSkipBtn = document.getElementById("rest-skip");

// Rest-length editor modal
const restEditorEl = document.getElementById("rest-editor");
const restEditorValueEl = document.getElementById("rest-editor-value");
const restEditorPlusBtn = document.getElementById("rest-editor-plus");
const restEditorMinusBtn = document.getElementById("rest-editor-minus");
const restEditorSaveBtn = document.getElementById("rest-editor-save");
const restEditorCancelBtn = document.getElementById("rest-editor-cancel");

// Routine editor sub-view
const newRoutineBtn = document.getElementById("new-routine");
const routineView = document.getElementById("routine-view");
const routineTitleEl = document.getElementById("routine-title");
const routineBackBtn = document.getElementById("routine-back");
const routineNameInput = document.getElementById("routine-name");
const routineRestInput = document.getElementById("routine-rest");
const routineExercisesEl = document.getElementById("routine-exercises");
const routineEmptyMsg = document.getElementById("routine-empty-msg");
const routineAddExerciseBtn = document.getElementById("routine-add-exercise");
const routineSaveBtn = document.getElementById("routine-save");
const routineDeleteBtn = document.getElementById("routine-delete");

// History: a 3-row preview on the home screen + the full sub-view
const homeHistoryEl = document.getElementById("home-history");
const homeHistoryListEl = document.getElementById("home-history-list");
const homeHistoryMoreBtn = document.getElementById("home-history-more");
const historyView = document.getElementById("history-view");
const historyBackBtn = document.getElementById("history-back");
const historyStatusEl = document.getElementById("history-status");
const historyListEl = document.getElementById("history-list");
const historyDetailView = document.getElementById("history-detail-view");
const historyDetailBackBtn = document.getElementById("history-detail-back");
const historyDetailTitleEl = document.getElementById("history-detail-title");
const historyDetailMetaEl = document.getElementById("history-detail-meta");
const historyDetailExercisesEl = document.getElementById("history-detail-exercises");
const historyDetailDeleteBtn = document.getElementById("history-detail-delete");

// Settings sub-view (+ its Change password / Delete account pages)
const settingsView = document.getElementById("settings-view");
const settingsBackBtn = document.getElementById("settings-back");
const settingsProfileForm = document.getElementById("settings-profile-form");
const settingsProfileMsg = document.getElementById("settings-profile-msg");
const setNameInput = document.getElementById("set-name");
const setEmailInput = document.getElementById("set-email");
const setRestInput = document.getElementById("set-rest");
const settingsExportBtn = document.getElementById("settings-export");
const settingsChangePwBtn = document.getElementById("settings-change-password-btn");
const settingsDeleteAcctBtn = document.getElementById("settings-delete-account-btn");

const passwordView = document.getElementById("password-view");
const passwordBackBtn = document.getElementById("password-back");
const settingsPasswordForm = document.getElementById("settings-password-form");
const settingsPasswordMsg = document.getElementById("settings-password-msg");
const setCurPwInput = document.getElementById("set-cur-pw");
const setNewPwInput = document.getElementById("set-new-pw");

const deleteView = document.getElementById("delete-view");
const deleteBackBtn = document.getElementById("delete-back");
const setDeleteEmailInput = document.getElementById("set-delete-email");
const settingsDeleteMsg = document.getElementById("settings-delete-msg");
const settingsDeleteBtn = document.getElementById("settings-delete");

// The logged-in user's profile (from /api/auth/me), kept for the Settings screen.
let currentUser = null;

// The user's routines + folders, loaded from the backend after login.
let routines = [];
let folders = [];
let editMode = false;   // home-screen "Edit" toggle: shows reorder / rename / delete

// Current mode: "login" or "register".
let mode = "login";

function setMode(next) {
  mode = next;
  const registering = mode === "register";

  tabLogin.classList.toggle("is-active", !registering);
  tabRegister.classList.toggle("is-active", registering);
  nameField.hidden = !registering;                       // name is only needed to register
  submitBtn.textContent = registering ? "Create account" : "Log in";
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  showMessage("");                                       // clear any old error
}

// Show an error (red) or an "ok" message (green).
function showMessage(text, kind = "error") {
  messageEl.textContent = text;
  messageEl.dataset.kind = kind;
}

tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));

// --- Submit (register or login) -----------------------------------------
form.addEventListener("submit", async (event) => {
  event.preventDefault();                                // don't reload the page
  submitBtn.disabled = true;

  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;
  const displayName = document.getElementById("display_name").value.trim();

  const path = mode === "register" ? "/register" : "/login";
  const payload = mode === "register"
    ? { email, display_name: displayName, password }
    : { email, password };

  try {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Try to read the JSON body even on errors (FastAPI puts errors in "detail").
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(detailToText(data.detail) || "Something went wrong. Please try again.");
      return;
    }

    store.set(data);          // save the access + refresh tokens
    await loadProfile();      // prove the access token actually works
  } catch (err) {
    showMessage("Could not reach the server.");
  } finally {
    submitBtn.disabled = false;
  }
});

// FastAPI validation errors put "detail" as a list of objects; simple errors
// use a plain string. This turns either into readable text.
function detailToText(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(" ");
  return "";
}

// --- Protected call: who am I? ------------------------------------------
async function loadProfile() {
  try {
    const res = await authFetch(API + "/me");   // authFetch refreshes a stale token
    if (!res.ok) {
      store.clear();
      showLoggedOut();
      return;
    }
    showLoggedIn(await res.json());
  } catch (err) {
    // authFetch already cleared tokens + showed the login form on a hard 401.
    showLoggedOut();
  }
}

// The mutually-exclusive top-level screens. Every navigation goes through
// showView() so exactly one is ever visible.
const ALL_VIEWS = [
  home, exercisesView, exerciseCreateView, workoutView, routineView,
  historyView, historyDetailView, settingsView, passwordView, deleteView,
];

function showView(el) {
  for (const v of ALL_VIEWS) v.hidden = v !== el;
  // Leaving the workout screen only detaches the bar -- the countdown keeps
  // running and re-appears when you come back.
  if (el !== workoutView) hideRestTimer();
}

function showLoggedIn(user) {
  currentUser = user;
  editMode = false;
  form.hidden = true;
  tabsEl.hidden = true;
  showView(home);
  whoEl.textContent = user.display_name;
  loadRoutines();
  loadActiveWorkout();
  loadHomeHistory();
}

function showLoggedOut() {
  form.hidden = false;
  tabsEl.hidden = false;
  for (const v of ALL_VIEWS) v.hidden = true;
  stopDurationTimer();
  endRestTimer();
  activeWorkout = null;
  refreshStartButton();
}

function moveBtn(dir, disabled, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "routine-move";
  b.textContent = dir < 0 ? "▲" : "▼";
  b.setAttribute("aria-label", dir < 0 ? "Move up" : "Move down");
  b.disabled = disabled;
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}

// Folders, each holding its routine rows. "Edit" mode reveals reorder / rename /
// delete controls; otherwise it's just tappable folder headers + routine names.
function renderFolders() {
  routineList.replaceChildren();
  routineEmpty.hidden = true;   // each folder shows its own empty state now
  editRoutinesBtn.textContent = editMode ? "Done" : "Edit";

  const nonDefault = folders.filter((f) => !f.is_default);

  folders.forEach((folder) => {
    const section = document.createElement("div");
    section.className = "folder" + (folder.collapsed ? " folder--collapsed" : "");

    const mine = routines.filter((r) => r.folder_id === folder.id);

    // A div (not a button) so the edit-mode buttons can nest inside it.
    const head = document.createElement("div");
    head.className = "folder-head";
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.addEventListener("click", () => toggleFolder(folder));
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFolder(folder); }
    });

    const chevron = document.createElement("span");
    chevron.className = "folder-chevron";
    chevron.textContent = "▾";
    const nameEl = document.createElement("span");
    nameEl.className = "folder-name";
    nameEl.textContent = folder.name;
    const countEl = document.createElement("span");
    countEl.className = "folder-count";
    countEl.textContent = `(${mine.length})`;
    head.append(chevron, nameEl, countEl);

    if (editMode) {
      const di = nonDefault.indexOf(folder);
      if (!folder.is_default) {
        head.append(
          moveBtn(-1, di === 0, () => reorderFolder(di, -1)),
          moveBtn(1, di === nonDefault.length - 1, () => reorderFolder(di, 1)),
        );
      }
      const ren = document.createElement("button");
      ren.type = "button";
      ren.className = "folder-edit-btn";
      ren.textContent = "✎";
      ren.setAttribute("aria-label", "Rename folder");
      ren.addEventListener("click", (e) => { e.stopPropagation(); renameFolder(folder); });
      head.append(ren);
      if (!folder.is_default) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "folder-edit-btn";
        del.textContent = "🗑";
        del.setAttribute("aria-label", "Delete folder");
        del.addEventListener("click", (e) => { e.stopPropagation(); deleteFolder(folder); });
        head.append(del);
      }
    }

    section.append(head);

    if (!folder.collapsed) {
      const body = document.createElement("div");
      body.className = "folder-body";
      if (mine.length === 0) {
        const empty = document.createElement("p");
        empty.className = "folder-empty";
        empty.textContent = "No routines here yet.";
        body.append(empty);
      }
      mine.forEach((routine, i) => {
        const row = document.createElement("div");
        row.className = "routine-row";

        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.className = "routine-name-btn";
        nameBtn.textContent = routine.name;
        nameBtn.addEventListener("click", () => startRoutine(routine));
        row.append(nameBtn);

        if (editMode) {
          row.append(
            moveBtn(-1, i === 0, () => moveRoutineInFolder(folder, mine, i, -1)),
            moveBtn(1, i === mine.length - 1, () => moveRoutineInFolder(folder, mine, i, 1)),
          );
          const menu = document.createElement("button");
          menu.type = "button";
          menu.className = "routine-menu";
          menu.textContent = "⋮";
          menu.setAttribute("aria-label", "Edit routine");
          menu.addEventListener("click", () => openRoutineEditor(routine));
          row.append(menu);
        }

        body.append(row);
      });
      section.append(body);
    }

    routineList.append(section);
  });
}

logoutBtn.addEventListener("click", () => {
  store.clear();
  showLoggedOut();
  showMessage("");
});

// --- Exercises --------------------------------------------------------------
const EXERCISES_API = "/api/exercises";

// Swap the refresh token for a fresh access + refresh pair. Deduped so a burst of
// parallel 401s only triggers one refresh request.
let refreshInFlight = null;
function refreshSession() {
  if (!store.refresh) return Promise.resolve(false);
  if (!refreshInFlight) {
    refreshInFlight = fetch(API + "/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: store.refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        store.set(await res.json());
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// fetch() with the access token attached. On a 401 we try to refresh the session
// once and retry; only if that fails do we drop back to the login form.
async function authFetch(path, options = {}, retried = false) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + store.access },
  });

  if (res.status !== 401) return res;

  if (!retried && (await refreshSession())) {
    return authFetch(path, options, true);
  }

  store.clear();
  showLoggedOut();
  throw new Error("Session expired. Please log in again.");
}

// When set, the Exercises view acts as a picker: tapping a row calls this with
// the chosen exercise instead of expanding its details. exercisesReturnTo is the
// view to show again when the picker closes.
let exercisePickHandler = null;
let exercisesReturnTo = home;

// openExercises()                      -> browse the library from the home screen
// openExercises({ onPick, returnTo })  -> pick an exercise for another view
function openExercises({ onPick = null, returnTo = home } = {}) {
  exercisePickHandler = onPick;
  exercisesReturnTo = returnTo;
  exerciseSearch.value = "";        // always start a fresh search
  filterEquipmentSel.value = "";
  filterMuscleSel.value = "";
  filterEquipmentSel.classList.remove("is-active");
  filterMuscleSel.classList.remove("is-active");
  showView(exercisesView);
  loadExercises();
}

function closeExercises() {
  const back = exercisesReturnTo;
  exercisePickHandler = null;
  exercisesReturnTo = home;
  showView(back);
}

exercisesBtn.addEventListener("click", () => openExercises());
exercisesBack.addEventListener("click", closeExercises);

exerciseAddBtn.addEventListener("click", () => {
  addExerciseForm.reset();
  addExerciseMessage.textContent = "";
  showView(exerciseCreateView);
  document.getElementById("ex-name").focus();
});
exerciseCreateBackBtn.addEventListener("click", () => showView(exercisesView));

// The whole library, loaded once; search + filters run client-side over it.
let allExercises = [];

async function loadExercises() {
  exerciseStatus.textContent = "Loading…";
  exerciseListEl.replaceChildren();
  try {
    const res = await authFetch(EXERCISES_API);
    if (!res.ok) {
      exerciseStatus.textContent = "Could not load exercises.";
      return;
    }
    allExercises = await res.json();
    populateExerciseOptions();
    applyExerciseFilters();
  } catch (err) {
    exerciseStatus.textContent = err.message || "Could not reach the server.";
  }
}

// Distinct taxonomy values from the loaded library, feeding both the filter
// dropdowns and the "New exercise" form's suggestion menus.
let equipmentOptions = [];
let muscleOptions = [];
let categoryOptions = [];

function populateExerciseOptions() {
  const equip = new Set();
  const muscles = new Set();
  const categories = new Set();
  for (const ex of allExercises) {
    if (ex.equipment) equip.add(ex.equipment);
    if (ex.category) categories.add(ex.category);
    for (const m of ex.primary_muscles || []) muscles.add(m);
  }
  equipmentOptions = [...equip].sort();
  muscleOptions = [...muscles].sort();
  categoryOptions = [...categories].sort();

  fillOptions(filterEquipmentSel, "All equipment", equipmentOptions);
  fillOptions(filterMuscleSel, "All body parts", muscleOptions);
}

// A cross-platform autocomplete menu (native <datalist> is unreliable on iOS).
// getOptions() returns the current candidate list; `multi` treats the input as
// a comma-separated list and completes the segment after the last comma.
function attachSuggest(input, getOptions, { multi = false } = {}) {
  const field = input.closest(".field") || input.parentElement;
  field.classList.add("field--suggest");
  const menu = document.createElement("div");
  menu.className = "suggest-menu";
  menu.hidden = true;
  field.append(menu);

  const currentToken = () => {
    const raw = multi ? input.value.split(",").pop() : input.value;
    return raw.trim();
  };
  const setToken = (val) => {
    if (!multi) { input.value = val; return; }
    const parts = input.value.split(",");
    parts[parts.length - 1] = ` ${val}`;
    input.value = parts.join(",").trimStart();
  };

  function render() {
    const t = currentToken().toLowerCase();
    const chosen = multi
      ? new Set(input.value.split(",").map((s) => s.trim().toLowerCase()))
      : new Set();
    const matches = getOptions()
      .filter((o) => o.toLowerCase().includes(t) && !chosen.has(o.toLowerCase()))
      .slice(0, 8);
    if (!matches.length || (matches.length === 1 && matches[0].toLowerCase() === t)) {
      menu.hidden = true;
      return;
    }
    menu.replaceChildren(
      ...matches.map((o) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "suggest-item";
        item.textContent = o;
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();   // fire before the input's blur, keep focus
          setToken(o);
          menu.hidden = true;
          input.focus();
        });
        return item;
      }),
    );
    menu.hidden = false;
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", () => setTimeout(() => { menu.hidden = true; }, 150));
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.hidden = true; });
}

attachSuggest(document.getElementById("ex-category"), () => categoryOptions);
attachSuggest(document.getElementById("ex-equipment"), () => equipmentOptions);
attachSuggest(document.getElementById("ex-muscles"), () => muscleOptions, { multi: true });

function fillOptions(sel, allLabel, values) {
  const keep = sel.value;
  sel.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = allLabel;
  sel.append(first);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v.replace(/\b\w/g, (c) => c.toUpperCase());
    sel.append(opt);
  }
  sel.value = values.includes(keep) ? keep : "";
  sel.classList.toggle("is-active", Boolean(sel.value));
}

function applyExerciseFilters() {
  const q = exerciseSearch.value.trim().toLowerCase();
  const eq = filterEquipmentSel.value;
  const mu = filterMuscleSel.value;
  const filtered = allExercises.filter((ex) => {
    if (q && !ex.name.toLowerCase().includes(q)) return false;
    if (eq && ex.equipment !== eq) return false;
    if (mu && !(ex.primary_muscles || []).includes(mu)) return false;
    return true;
  });
  renderExercises(filtered, Boolean(q || eq || mu));
}

function renderExercises(items, isFiltered) {
  exerciseListEl.replaceChildren();

  if (items.length === 0) {
    exerciseStatus.textContent = isFiltered
      ? "No exercises match."
      : "No exercises yet.";
    return;
  }

  exerciseStatus.textContent = `${items.length} exercise${items.length === 1 ? "" : "s"}`;

  // Picker mode: each exercise is a button that hands itself to the caller.
  if (exercisePickHandler) {
    for (const ex of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exercise-pick";

      const name = document.createElement("span");
      name.className = "exercise-pick-name";
      name.textContent = ex.name;
      btn.append(name);

      const meta = [ex.category, ex.equipment].filter(Boolean).join(" · ");
      if (meta) {
        const metaEl = document.createElement("span");
        metaEl.className = "exercise-pick-meta";
        metaEl.textContent = meta;
        btn.append(metaEl);
      }

      btn.addEventListener("click", () => exercisePickHandler(ex));
      exerciseListEl.append(btn);
    }
    return;
  }

  for (const ex of items) {
    const row = document.createElement("details");
    row.className = "exercise";

    const summary = document.createElement("summary");
    summary.className = "exercise-name";
    summary.textContent = ex.name;
    if (ex.is_custom) {
      const tag = document.createElement("span");
      tag.className = "exercise-tag";
      tag.textContent = "custom";
      summary.append(" ", tag);
    }
    row.append(summary);

    const meta = [ex.category, ex.equipment, (ex.primary_muscles || []).join(", ")]
      .filter(Boolean)
      .join(" · ");
    if (meta) {
      const metaEl = document.createElement("p");
      metaEl.className = "exercise-meta";
      metaEl.textContent = meta;
      row.append(metaEl);
    }

    const body = document.createElement("div");
    body.className = "exercise-detail-body";
    row.append(body);

    // Load this exercise's history the first time it's expanded.
    let loaded = false;
    row.addEventListener("toggle", () => {
      if (row.open && !loaded) {
        loaded = true;
        loadExerciseDetail(ex, body);
      }
    });

    exerciseListEl.append(row);
  }
}

const exerciseStatsCache = new Map();

async function loadExerciseDetail(ex, body) {
  body.textContent = "Loading…";
  let stats = exerciseStatsCache.get(ex.id);
  if (!stats) {
    try {
      const res = await authFetch(`${EXERCISES_API}/${ex.id}/stats`);
      if (!res.ok) { body.textContent = "Could not load history."; return; }
      stats = await res.json();
      exerciseStatsCache.set(ex.id, stats);
    } catch (err) {
      body.textContent = err.message || "Could not reach the server.";
      return;
    }
  }
  renderExerciseDetail(ex, body, stats);
}

function statTile(label, value) {
  const tile = document.createElement("div");
  tile.className = "exercise-stat";
  const l = document.createElement("span");
  l.className = "exercise-stat-label";
  l.textContent = label;
  const v = document.createElement("span");
  v.className = "exercise-stat-value";
  v.textContent = value;
  tile.append(l, v);
  return tile;
}

function renderExerciseDetail(ex, body, stats) {
  body.replaceChildren();

  if (!stats.performed_count) {
    const p = document.createElement("p");
    p.className = "exercise-empty";
    p.textContent = "No history for this exercise yet.";
    body.append(p);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "exercise-stats";
  const lb = (n) => (n == null ? "—" : `${fmtVolume(n)}`);
  grid.append(
    statTile(
      "Heaviest set",
      stats.heaviest_weight == null
        ? "—"
        : `${stats.heaviest_weight} × ${stats.heaviest_weight_reps ?? "–"}`,
    ),
    statTile("Best est. 1RM", stats.best_1rm == null ? "—" : `~${lb(stats.best_1rm)}`),
    statTile(
      "Most reps",
      stats.most_reps == null
        ? "—"
        : `${stats.most_reps} × ${stats.most_reps_weight ?? "–"}`,
    ),
    statTile("Best session vol.", lb(stats.best_session_volume)),
    statTile("Total volume", lb(stats.total_volume)),
    statTile("Sessions", String(stats.performed_count)),
  );
  body.append(grid);

  if (stats.sessions.length >= 2) {
    const chart = buildExerciseChart(stats.sessions);
    if (chart) body.append(chart);
  }

  const list = document.createElement("div");
  list.className = "exercise-sessions";
  // newest first in the list
  [...stats.sessions].reverse().forEach((s) => {
    const rowEl = document.createElement("div");
    rowEl.className = "exercise-session";

    const main = document.createElement("span");
    main.className = "exercise-session-main";
    const top =
      s.top_weight == null ? "—" : `${s.top_weight} × ${s.top_reps ?? "–"}`;
    main.textContent = `${fmtDate(s.date)}  ·  ${top}  ·  ${fmtVolume(s.volume)}`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "exercise-session-del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Delete this workout");
    del.addEventListener("click", async () => {
      if (!confirm("Delete this workout? It's removed from history everywhere.")) return;
      try {
        const res = await authFetch(`${WORKOUTS_API}/${s.workout_id}`, { method: "DELETE" });
        if (res.status !== 204 && res.status !== 404) return;
        exerciseStatsCache.delete(ex.id);
        loadExerciseDetail(ex, body);
        loadHomeHistory();
      } catch (err) {
        /* ignore */
      }
    });

    rowEl.append(main, del);
    list.append(rowEl);
  });
  body.append(list);
}

// Inline-SVG line chart of heaviest-set weight across sessions (oldest -> newest).
function buildExerciseChart(sessions) {
  const pts = sessions
    .map((s) => ({ date: s.date, y: s.top_weight }))
    .filter((p) => p.y != null);
  if (pts.length < 2) return null;

  const W = 300, H = 120, padL = 34, padR = 8, padT = 10, padB = 18;
  const ys = pts.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");

  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("class", "exercise-chart-line");
  line.setAttribute("points", pts.map((p, i) => `${x(i)},${y(p.y)}`).join(" "));
  svg.append(line);

  pts.forEach((p, i) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "exercise-chart-dot");
    c.setAttribute("cx", x(i));
    c.setAttribute("cy", y(p.y));
    c.setAttribute("r", "2.5");
    svg.append(c);
  });

  const label = (tx, ty, text, anchor) => {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("class", "exercise-chart-axis");
    t.setAttribute("x", tx);
    t.setAttribute("y", ty);
    if (anchor) t.setAttribute("text-anchor", anchor);
    t.textContent = text;
    svg.append(t);
  };
  label(2, y(max) + 3, String(Math.round(max)));
  label(2, y(min) + 3, String(Math.round(min)));
  const d = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  label(padL, H - 4, d(pts[0].date), "start");
  label(W - padR, H - 4, d(pts[pts.length - 1].date), "end");

  const wrap = document.createElement("div");
  wrap.className = "exercise-chart";
  wrap.append(svg);
  return wrap;
}

// Search + filters are client-side over the loaded library -- instant, no fetch.
exerciseSearch.addEventListener("input", applyExerciseFilters);
filterEquipmentSel.addEventListener("change", () => {
  filterEquipmentSel.classList.toggle("is-active", Boolean(filterEquipmentSel.value));
  applyExerciseFilters();
});
filterMuscleSel.addEventListener("change", () => {
  filterMuscleSel.classList.toggle("is-active", Boolean(filterMuscleSel.value));
  applyExerciseFilters();
});

// Add a custom exercise, then refresh the list so it (and everyone else) sees it.
addExerciseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  addExerciseSubmit.disabled = true;
  addExerciseMessage.textContent = "";
  addExerciseMessage.dataset.kind = "error";

  const name = document.getElementById("ex-name").value.trim();
  if (!name) {
    addExerciseMessage.textContent = "A name is required.";
    addExerciseSubmit.disabled = false;
    return;
  }

  // The taxonomy fields are lower-cased so custom entries line up with the
  // seeded library (which is all lower-case) and the filters don't fragment.
  const payload = {
    name,
    category: document.getElementById("ex-category").value.trim().toLowerCase() || null,
    equipment: document.getElementById("ex-equipment").value.trim().toLowerCase() || null,
    primary_muscles: splitList(document.getElementById("ex-muscles").value, ",").map((m) =>
      m.toLowerCase(),
    ),
    instructions: splitList(document.getElementById("ex-instructions").value, "\n"),
  };

  try {
    const res = await authFetch(EXERCISES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      addExerciseMessage.textContent =
        detailToText(data.detail) || "Could not add the exercise.";
      return;
    }

    addExerciseForm.reset();
    showView(exercisesView);
    await loadExercises();           // pick up the new exercise + refreshed filters
    exerciseSearch.value = data.name;
    applyExerciseFilters();
  } catch (err) {
    addExerciseMessage.textContent = err.message || "Could not reach the server.";
  } finally {
    addExerciseSubmit.disabled = false;
  }
});

// "a, b, c" or a multi-line string -> ["a", "b", "c"], blanks dropped.
function splitList(value, separator) {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

// --- Active workout -------------------------------------------------------
const WORKOUTS_API = "/api/workouts";

// The in-progress workout, mirrored from the backend:
//   { id, status, started_at,
//     content: { exercises: [ { exercise_id, name, notes,
//                               sets: [ { weight, reps, done } ] } ] } }
let activeWorkout = null;
let durationTimer = null;
let workoutSaveTimer = null;

// exercise_id -> { last_sets: [{weight,reps}], best_weight, best_1rm }
// Drives the PREVIOUS column, set autofill, and PR detection.
let previousByExercise = {};

function epley1rm(w, r) {
  return (Number(w) || 0) * (1 + (Number(r) || 0) / 30);
}

async function loadPreviousForWorkout() {
  previousByExercise = {};
  const ids = [
    ...new Set(
      (activeWorkout?.content?.exercises || [])
        .map((e) => e.exercise_id)
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return;
  try {
    const res = await authFetch(
      `${WORKOUTS_API}/previous?exercise_ids=${encodeURIComponent(ids.join(","))}`,
    );
    if (!res.ok) return;
    previousByExercise = await res.json();
    autofillFromPrevious();
    if (!workoutView.hidden) renderWorkout();
  } catch (err) {
    /* previous data is a nicety; ignore failures */
  }
}

// Pre-fill only sets the user hasn't touched (both weight and reps still blank).
function autofillFromPrevious() {
  if (!activeWorkout) return;
  let changed = false;
  for (const entry of activeWorkout.content.exercises) {
    const prev = previousByExercise[entry.exercise_id];
    if (!prev || !prev.last_sets || !prev.last_sets.length) continue;
    entry.sets.forEach((set, i) => {
      const last = prev.last_sets[i];
      if (last && set.weight == null && set.reps == null && !set.done) {
        set.weight = last.weight ?? null;
        set.reps = last.reps ?? null;
        changed = true;
      }
    });
  }
  if (changed) scheduleSave();
}

// On login: find out whether a workout is already in progress.
async function loadActiveWorkout() {
  try {
    const res = await authFetch(WORKOUTS_API + "/active");
    activeWorkout = res.ok ? await res.json() : null;
  } catch (err) {
    activeWorkout = null;
  }
  refreshStartButton();

  // A workout in progress -> jump straight into it (unless the user already
  // navigated somewhere else while the request was in flight).
  if (activeWorkout && !home.hidden) openWorkout();
}

// The single entry point to the active workout. Blue "Start empty workout" when
// idle; green "Resume workout <elapsed>" (ticking) while a workout is in
// progress. Also (re)starts the duration timer so the elapsed time stays live
// even when we're not on the workout screen (e.g. after a reload).
function refreshStartButton() {
  const active = Boolean(activeWorkout);
  startEmptyLabelEl.textContent = active ? "Resume workout" : "Start empty workout";
  startEmptyBtn.classList.toggle("action--active", active);
  if (!active) startEmptyTimeEl.textContent = "";
  if (active && !durationTimer) startDurationTimer();
}

function ensureContent() {
  if (!activeWorkout.content) activeWorkout.content = { exercises: [] };
  if (!Array.isArray(activeWorkout.content.exercises)) {
    activeWorkout.content.exercises = [];
  }
}

// Start a new workout (or resume the existing one) and open the screen.
startEmptyBtn.addEventListener("click", async () => {
  startEmptyBtn.disabled = true;
  try {
    if (!activeWorkout) {
      const res = await authFetch(WORKOUTS_API, { method: "POST" });
      if (!res.ok) return;
      activeWorkout = await res.json();
    }
    openWorkout();
  } catch (err) {
    /* authFetch already handled a dead session; otherwise stay on home */
  } finally {
    startEmptyBtn.disabled = false;
  }
});

function openWorkout() {
  ensureContent();
  // Neutralise any half-open picker / routine editor we may be jumping over.
  exercisePickHandler = null;
  editingRoutine = null;
  showView(workoutView);
  renderWorkout();
  startDurationTimer();
  resumeRestTimer();         // re-show the countdown if one's still running
  refreshStartButton();      // turn the home button green + start the elapsed clock
  loadPreviousForWorkout();  // fills the PREVIOUS column + autofills, then re-renders
}

// Back arrow: leave the workout running (it's saved server-side) and go home.
// The duration timer keeps running so the home button's elapsed time stays live.
function closeWorkout() {
  flushWorkoutSave();
  refreshStartButton();
  showView(home);
}
workoutBack.addEventListener("click", closeWorkout);

// --- Rendering -----------------------------------------------------------
function renderWorkout() {
  if (!activeWorkout) return;
  ensureContent();
  const exercises = activeWorkout.content.exercises;

  workoutExercisesEl.replaceChildren();
  workoutEmptyEl.hidden = exercises.length > 0;
  exercises.forEach((entry, exIndex) => {
    workoutExercisesEl.append(buildExerciseBlock(entry, exIndex));
  });

  updateWorkoutStats();
}

function buildExerciseBlock(entry, exIndex) {
  const block = document.createElement("div");
  block.className = "workout-exercise";

  const head = document.createElement("div");
  head.className = "workout-exercise-head";

  const name = document.createElement("span");
  name.className = "workout-exercise-name";
  name.textContent = entry.name;

  const removeEx = document.createElement("button");
  removeEx.type = "button";
  removeEx.className = "link-danger";
  removeEx.textContent = "Remove";
  removeEx.addEventListener("click", () => {
    activeWorkout.content.exercises.splice(exIndex, 1);
    renderWorkout();
    scheduleSave();
  });

  head.append(name, removeEx);
  block.append(head);

  const notes = document.createElement("textarea");
  notes.className = "workout-notes";
  notes.rows = 1;
  notes.placeholder = "Add notes here…";
  notes.value = entry.notes || "";
  notes.addEventListener("input", () => {
    entry.notes = notes.value;
    scheduleSave();
  });
  block.append(notes);

  const restLabel = document.createElement("button");
  restLabel.type = "button";
  restLabel.className = "exercise-rest";
  restLabel.textContent = `Rest Timer: ${fmtRest(workoutRestSeconds())}`;
  restLabel.addEventListener("click", openRestEditor);
  block.append(restLabel);

  const prev = previousByExercise[entry.exercise_id];

  const grid = document.createElement("div");
  grid.className = "sets-grid";
  for (const label of ["SET", "PREV", "LBS", "REPS", "✓", ""]) {
    const cell = document.createElement("div");
    cell.className = "sets-grid-head";
    cell.textContent = label;
    grid.append(cell);
  }

  entry.sets.forEach((set, setIndex) => {
    const num = document.createElement("div");
    num.className = "set-num";
    if (set.pr_weight || set.pr_1rm) num.classList.add("set-num--pr");
    num.textContent = String(setIndex + 1);

    const prevCell = document.createElement("div");
    prevCell.className = "set-prev";
    const last = prev && prev.last_sets && prev.last_sets[setIndex];
    prevCell.textContent =
      last && (last.weight != null || last.reps != null)
        ? `${last.weight ?? "–"}×${last.reps ?? "–"}`
        : "–";

    const weight = document.createElement("input");
    weight.className = "set-input";
    weight.type = "text";
    weight.inputMode = "decimal";
    weight.value = set.weight ?? "";
    weight.addEventListener("input", () => {
      const n = parseFloat(weight.value);
      set.weight = Number.isFinite(n) ? n : null;
      updateWorkoutStats();
      scheduleSave();
    });

    const reps = document.createElement("input");
    reps.className = "set-input";
    reps.type = "text";
    reps.inputMode = "numeric";
    reps.value = set.reps ?? "";
    reps.addEventListener("input", () => {
      const n = parseInt(reps.value, 10);
      set.reps = Number.isFinite(n) ? n : null;
      updateWorkoutStats();
      scheduleSave();
    });

    const doneWrap = document.createElement("div");
    doneWrap.className = "set-done-wrap";
    const done = document.createElement("input");
    done.type = "checkbox";
    done.className = "set-done";
    done.checked = !!set.done;
    done.addEventListener("change", () => {
      set.done = done.checked;
      if (set.done) {
        checkForPr(entry, set, num);
        startRestTimer();
      } else {
        set.pr_weight = false;
        set.pr_1rm = false;
        num.classList.remove("set-num--pr");
      }
      block.classList.toggle("has-done-sets", entry.sets.some((s) => s.done));
      updateWorkoutStats();
      scheduleSave();
    });
    doneWrap.append(done);

    const removeSet = document.createElement("button");
    removeSet.type = "button";
    removeSet.className = "set-remove";
    removeSet.setAttribute("aria-label", "Remove set");
    removeSet.textContent = "✕";
    removeSet.addEventListener("click", () => {
      entry.sets.splice(setIndex, 1);
      renderWorkout();
      scheduleSave();
    });

    grid.append(num, prevCell, weight, reps, doneWrap, removeSet);
  });

  block.append(grid);

  const addSet = document.createElement("button");
  addSet.type = "button";
  addSet.className = "ghost workout-add-set";
  addSet.textContent = "+ Add Set";
  addSet.addEventListener("click", () => {
    entry.sets.push({ weight: null, reps: null, done: false });
    renderWorkout();
    scheduleSave();
  });
  block.append(addSet);

  return block;
}

function updateWorkoutStats() {
  if (!activeWorkout) return;
  ensureContent();

  let volume = 0;
  let doneCount = 0;
  for (const entry of activeWorkout.content.exercises) {
    for (const set of entry.sets) {
      if (!set.done) continue;
      doneCount += 1;
      volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    }
  }

  workoutVolumeEl.textContent =
    `${Number.isInteger(volume) ? volume : volume.toFixed(1)} lbs`;
  workoutSetsEl.textContent = String(doneCount);
}

// When a set is completed, see if it beats the user's best weight / best 1RM for
// this exercise. The first completed set of an exercise with no history just
// establishes the baseline (no PR shout).
function checkForPr(entry, set, numEl) {
  const w = Number(set.weight) || 0;
  const r = Number(set.reps) || 0;
  if (w <= 0) return;

  const prev = entry.exercise_id ? previousByExercise[entry.exercise_id] : null;
  if (!prev) return;   // custom exercise with no id -> can't track

  const e1 = epley1rm(w, r);
  const weightPr = prev.best_weight != null && w > prev.best_weight;
  const oneRmPr = r > 0 && prev.best_1rm != null && e1 > prev.best_1rm;

  set.pr_weight = weightPr;
  set.pr_1rm = oneRmPr;

  // Raise the bar (also sets the baseline the first time round).
  if (prev.best_weight == null || w > prev.best_weight) prev.best_weight = w;
  if (r > 0 && (prev.best_1rm == null || e1 > prev.best_1rm)) prev.best_1rm = e1;

  if (weightPr || oneRmPr) {
    numEl.classList.add("set-num--pr");
    const kinds = [];
    if (weightPr) kinds.push(`Weight PR — ${w} lb`);
    if (oneRmPr) kinds.push(`1RM PR — ~${Math.round(e1)} lb`);
    showToast("🏆 " + kinds.join("    "));
  }
}

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
}

// --- Duration timer ----------------------------------------------------
function startDurationTimer() {
  stopDurationTimer();
  if (!activeWorkout) return;
  const tick = () => {
    if (!activeWorkout) return stopDurationTimer();
    const label = formatDuration(Date.now() - Date.parse(activeWorkout.started_at));
    workoutDurationEl.textContent = label;
    startEmptyTimeEl.textContent = label;
  };
  tick();
  durationTimer = setInterval(tick, 1000);
}

function stopDurationTimer() {
  if (durationTimer) clearInterval(durationTimer);
  durationTimer = null;
  startEmptyTimeEl.textContent = "";
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

// --- Rest timer ------------------------------------------------------
// The running countdown is kept in localStorage keyed by workout id, so it
// survives leaving the workout screen, a reload, or the app being closed.
let restEndsAt = 0;
let restTotalMs = 0;
let restInterval = null;
const REST_KEY = "rest";

function workoutRestSeconds() {
  return (
    (activeWorkout && activeWorkout.rest_seconds) ||
    (currentUser && currentUser.preferences && currentUser.preferences.default_rest_seconds) ||
    90
  );
}

function fmtRest(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (!m) return `${sec}s`;
  return sec ? `${m}min ${sec}s` : `${m}min`;
}

function persistRest() {
  try {
    if (!activeWorkout || !restInterval) return;
    localStorage.setItem(
      REST_KEY,
      JSON.stringify({ workoutId: activeWorkout.id, endsAt: restEndsAt, totalMs: restTotalMs }),
    );
  } catch (err) { /* private mode etc. */ }
}

function readPersistedRest() {
  try {
    return JSON.parse(localStorage.getItem(REST_KEY) || "null");
  } catch (err) {
    return null;
  }
}

function clearPersistedRest() {
  try { localStorage.removeItem(REST_KEY); } catch (err) { /* ignore */ }
}

function beginRestInterval() {
  restTimerEl.hidden = false;
  workoutView.classList.add("has-rest-timer");
  if (restInterval) clearInterval(restInterval);
  restInterval = setInterval(tickRest, 250);
  tickRest();
}

// Fresh countdown (a set was checked, or the label was tapped after editing).
function startRestTimer() {
  restTotalMs = workoutRestSeconds() * 1000;
  restEndsAt = Date.now() + restTotalMs;
  beginRestInterval();
  persistRest();
}

// Re-attach the bar to a countdown that's still running (entering the workout
// screen / after a reload).
function resumeRestTimer() {
  const saved = readPersistedRest();
  if (
    !activeWorkout || !saved ||
    saved.workoutId !== activeWorkout.id ||
    saved.endsAt <= Date.now()
  ) {
    endRestTimer();
    return;
  }
  restEndsAt = saved.endsAt;
  restTotalMs = saved.totalMs || (saved.endsAt - Date.now());
  beginRestInterval();
}

function tickRest() {
  const rem = restEndsAt - Date.now();
  if (rem <= 0) {
    endRestTimer();
    if (navigator.vibrate) navigator.vibrate(200);
    return;
  }
  restTimeEl.textContent = formatDuration(rem);
  restProgressEl.style.width = Math.max(0, Math.min(1, rem / restTotalMs)) * 100 + "%";
}

// Just detach the bar; the countdown keeps its state so it can resume.
function hideRestTimer() {
  if (restInterval) clearInterval(restInterval);
  restInterval = null;
  restTimerEl.hidden = true;
  workoutView.classList.remove("has-rest-timer");
}

// The rest is over / skipped / the workout ended -- wipe it.
function endRestTimer() {
  hideRestTimer();
  restEndsAt = 0;
  restTotalMs = 0;
  clearPersistedRest();
}

restMinusBtn.addEventListener("click", () => {
  restEndsAt = Math.max(Date.now() + 1000, restEndsAt - 15000);
  restTotalMs = Math.max(15000, restTotalMs - 15000);
  persistRest();
  tickRest();
});
restPlusBtn.addEventListener("click", () => {
  restEndsAt += 15000;
  restTotalMs += 15000;
  persistRest();
  tickRest();
});
restSkipBtn.addEventListener("click", endRestTimer);

// --- Rest-length editor (the "Rest Timer: ..." label opens this) ---
let restEditorValue = 90;

function openRestEditor() {
  restEditorValue = workoutRestSeconds();
  renderRestEditor();
  restEditorEl.hidden = false;
}
function renderRestEditor() {
  restEditorValueEl.textContent = formatDuration(restEditorValue * 1000);
  restEditorMinusBtn.disabled = restEditorValue <= 15;
  restEditorPlusBtn.disabled = restEditorValue >= 3600;
}
restEditorPlusBtn.addEventListener("click", () => {
  restEditorValue = Math.min(3600, restEditorValue + 15);
  renderRestEditor();
});
restEditorMinusBtn.addEventListener("click", () => {
  restEditorValue = Math.max(15, restEditorValue - 15);
  renderRestEditor();
});
restEditorCancelBtn.addEventListener("click", () => { restEditorEl.hidden = true; });
restEditorEl.addEventListener("click", (e) => {
  if (e.target === restEditorEl) restEditorEl.hidden = true;   // tap the backdrop
});
restEditorSaveBtn.addEventListener("click", async () => {
  restEditorEl.hidden = true;
  if (!activeWorkout) return;
  activeWorkout.rest_seconds = restEditorValue;
  renderWorkout();   // refresh every "Rest Timer: ..." label
  try {
    await authFetch(WORKOUTS_API + "/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: activeWorkout.content, rest_seconds: restEditorValue }),
    });
  } catch (err) { /* the label already updated locally */ }
});

// --- Saving ----------------------------------------------------------
function scheduleSave() {
  clearTimeout(workoutSaveTimer);
  workoutSaveTimer = setTimeout(() => saveWorkout(), 600);
}

async function saveWorkout({ keepalive = false } = {}) {
  clearTimeout(workoutSaveTimer);
  workoutSaveTimer = null;
  if (!activeWorkout) return;
  ensureContent();
  try {
    await authFetch(WORKOUTS_API + "/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: activeWorkout.content }),
      keepalive,
    });
  } catch (err) {
    /* best effort -- the next edit will try again */
  }
}

function flushWorkoutSave() {
  if (workoutSaveTimer) saveWorkout();
}

// If the tab is hidden/closed with an edit still pending, save right away.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && activeWorkout && workoutSaveTimer) {
    saveWorkout({ keepalive: true });
  }
});

// --- Add exercise / finish / discard --------------------------------
workoutAddExerciseBtn.addEventListener("click", () => {
  openExercises({ onPick: addExerciseToWorkout, returnTo: workoutView });
});

function addExerciseToWorkout(ex) {
  ensureContent();
  activeWorkout.content.exercises.push({
    exercise_id: ex.id,
    name: ex.name,
    notes: "",
    sets: [{ weight: null, reps: null, done: false }],
  });
  scheduleSave();
  closeExercises();          // back to the workout view
  renderWorkout();
  loadPreviousForWorkout();  // pull previous / PR data for the new exercise
}

workoutFinishBtn.addEventListener("click", async () => {
  workoutFinishBtn.disabled = true;
  try {
    await saveWorkout();     // persist the latest edits first
    await maybeSyncRoutineFromWorkout();
    const res = await authFetch(WORKOUTS_API + "/active/finish", { method: "POST" });
    if (!res.ok) return;
    endWorkoutUI();
  } catch (err) {
    /* stay on the workout screen */
  } finally {
    workoutFinishBtn.disabled = false;
  }
});

// If this workout came from a routine, offer to fold the (possibly changed)
// exercise list back into that routine.
async function maybeSyncRoutineFromWorkout() {
  const routineId = activeWorkout && activeWorkout.routine_id;
  if (!routineId) return;

  const routine = routines.find((r) => r.id === routineId);
  if (!routine) return;   // routine was deleted meanwhile

  if (!confirm(`Save these changes to routine "${routine.name}"?`)) return;

  const content = {
    exercises: activeWorkout.content.exercises.map((entry) => ({
      exercise_id: entry.exercise_id ?? null,
      name: entry.name,
      sets: entry.sets.map((s) => ({ weight: s.weight ?? null, reps: s.reps ?? null })),
    })),
  };

  try {
    await authFetch(`${ROUTINES_API}/${routineId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: routine.name,
        content,
        folder_id: routine.folder_id,
        rest_seconds: routine.rest_seconds ?? null,
      }),
    });
    await loadRoutines();
  } catch (err) {
    /* non-fatal -- the workout still finishes */
  }
}

workoutDiscardBtn.addEventListener("click", async () => {
  if (!confirm("Discard this workout? This can't be undone.")) return;
  workoutDiscardBtn.disabled = true;
  try {
    const res = await authFetch(WORKOUTS_API + "/active", { method: "DELETE" });
    if (!res.ok && res.status !== 404) return;
    endWorkoutUI();
  } catch (err) {
    /* stay on the workout screen */
  } finally {
    workoutDiscardBtn.disabled = false;
  }
});

// Shared teardown after a workout ends (finished or discarded).
function endWorkoutUI() {
  activeWorkout = null;
  clearTimeout(workoutSaveTimer);
  workoutSaveTimer = null;
  stopDurationTimer();
  endRestTimer();
  refreshStartButton();
  showView(home);
  loadHomeHistory();   // a just-finished workout should appear in the preview
}

// --- Routines ----------------------------------------------------------
const ROUTINES_API = "/api/routines";

// The routine currently open in the editor: { id?, name, content }. A deep copy,
// so nothing is saved until the Save button. originalRoutineJSON is the snapshot
// we compare against to detect unsaved changes.
let editingRoutine = null;
let originalRoutineJSON = "";

const FOLDERS_API = "/api/folders";

async function loadRoutines() {
  try {
    const [fRes, rRes] = await Promise.all([
      authFetch(FOLDERS_API),
      authFetch(ROUTINES_API),
    ]);
    folders = fRes.ok ? await fRes.json() : [];
    routines = rRes.ok ? await rRes.json() : [];
  } catch (err) {
    folders = [];
    routines = [];
  }
  renderFolders();
}

function defaultFolderId() {
  const d = folders.find((f) => f.is_default);
  return d ? d.id : (folders[0] && folders[0].id) || null;
}

// --- Folder mutations ---
async function toggleFolder(folder) {
  folder.collapsed = !folder.collapsed;
  renderFolders();
  try {
    await authFetch(`${FOLDERS_API}/${folder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collapsed: folder.collapsed }),
    });
  } catch (err) {
    /* best effort */
  }
}

newFolderBtn.addEventListener("click", async () => {
  const name = (prompt("New folder name") || "").trim();
  if (!name) return;
  try {
    const res = await authFetch(FOLDERS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) await loadRoutines();
  } catch (err) {
    /* ignore */
  }
});

async function renameFolder(folder) {
  const name = (prompt("Rename folder", folder.name) || "").trim();
  if (!name || name === folder.name) return;
  try {
    const res = await authFetch(`${FOLDERS_API}/${folder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) await loadRoutines();
  } catch (err) {
    /* ignore */
  }
}

async function deleteFolder(folder) {
  if (!confirm(`Delete folder "${folder.name}"? Its routines move to My Routines.`)) return;
  try {
    const res = await authFetch(`${FOLDERS_API}/${folder.id}`, { method: "DELETE" });
    if (res.status === 204) await loadRoutines();
  } catch (err) {
    /* ignore */
  }
}

// Reorder among the non-default folders (di = index within that subset).
async function reorderFolder(di, dir) {
  const nonDefault = folders.filter((f) => !f.is_default);
  const j = di + dir;
  if (j < 0 || j >= nonDefault.length) return;
  [nonDefault[di], nonDefault[j]] = [nonDefault[j], nonDefault[di]];
  folders = folders.filter((f) => f.is_default).concat(nonDefault);
  renderFolders();
  try {
    const res = await authFetch(FOLDERS_API + "/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: nonDefault.map((f) => f.id) }),
    });
    if (res.ok) folders = await res.json();
  } catch (err) {
    loadRoutines();
    return;
  }
  renderFolders();
}

// Reorder a routine within its folder. `mine` is that folder's ordered routines.
async function moveRoutineInFolder(folder, mine, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= mine.length) return;
  [mine[i], mine[j]] = [mine[j], mine[i]];
  // Reflect the new order in the flat `routines` array before re-render.
  const others = routines.filter((r) => r.folder_id !== folder.id);
  routines = others.concat(mine);
  renderFolders();
  try {
    const res = await authFetch(ROUTINES_API + "/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folder.id, ids: mine.map((r) => r.id) }),
    });
    if (res.ok) routines = await res.json();
  } catch (err) {
    loadRoutines();
    return;
  }
  renderFolders();
}

editRoutinesBtn.addEventListener("click", () => {
  editMode = !editMode;
  renderFolders();
});

// Start (or resume) a workout from a routine.
async function startRoutine(routine) {
  if (activeWorkout) {
    if (!confirm("You have a workout in progress — open that one instead?")) return;
    openWorkout();
    return;
  }
  try {
    const res = await authFetch(WORKOUTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routine_id: routine.id }),
    });
    if (!res.ok) return;
    activeWorkout = await res.json();
    openWorkout();
  } catch (err) {
    /* stay on home */
  }
}

// --- Routine editor --------------------------------------------------
newRoutineBtn.addEventListener("click", () => openRoutineEditor(null));

function openRoutineEditor(routine) {
  const folderId = routine ? routine.folder_id : defaultFolderId();
  const rest = routine ? (routine.rest_seconds ?? null) : null;
  editingRoutine = routine
    ? { id: routine.id, name: routine.name, folder_id: folderId, rest_seconds: rest, content: deepCopy(routine.content) }
    : { name: "", folder_id: folderId, rest_seconds: null, content: { exercises: [] } };
  if (!editingRoutine.content || !Array.isArray(editingRoutine.content.exercises)) {
    editingRoutine.content = { exercises: [] };
  }
  originalRoutineJSON = JSON.stringify(editingRoutine);

  routineTitleEl.textContent = routine ? "Edit Routine" : "New Routine";
  routineNameInput.value = editingRoutine.name;
  routineRestInput.value = editingRoutine.rest_seconds ?? "";
  routineDeleteBtn.hidden = !routine;

  routineFolderSelect.replaceChildren();
  for (const f of folders) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    routineFolderSelect.append(opt);
  }
  routineFolderSelect.value = editingRoutine.folder_id || defaultFolderId() || "";

  showView(routineView);
  renderRoutineEditor();
}

function closeRoutineEditor() {
  editingRoutine = null;
  showView(home);
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

routineNameInput.addEventListener("input", () => {
  if (editingRoutine) editingRoutine.name = routineNameInput.value;
});

routineFolderSelect.addEventListener("change", () => {
  if (editingRoutine) editingRoutine.folder_id = routineFolderSelect.value;
});

routineRestInput.addEventListener("input", () => {
  if (!editingRoutine) return;
  const v = routineRestInput.value.trim();
  if (v === "") {
    editingRoutine.rest_seconds = null;
  } else {
    editingRoutine.rest_seconds = Math.max(0, Math.min(3600, parseInt(v, 10) || 0));
  }
});

function renderRoutineEditor() {
  if (!editingRoutine) return;
  const exercises = editingRoutine.content.exercises;

  routineExercisesEl.replaceChildren();
  routineEmptyMsg.hidden = exercises.length > 0;
  exercises.forEach((entry, i) => {
    routineExercisesEl.append(buildRoutineExerciseBlock(entry, i));
  });
}

// Like buildExerciseBlock, but a template row: SET | LBS | REPS | remove,
// no done checkbox, no notes, no stats.
function buildRoutineExerciseBlock(entry, exIndex) {
  const block = document.createElement("div");
  block.className = "workout-exercise";

  const head = document.createElement("div");
  head.className = "workout-exercise-head";

  const name = document.createElement("span");
  name.className = "workout-exercise-name";
  name.textContent = entry.name;

  const removeEx = document.createElement("button");
  removeEx.type = "button";
  removeEx.className = "link-danger";
  removeEx.textContent = "Remove";
  removeEx.addEventListener("click", () => {
    editingRoutine.content.exercises.splice(exIndex, 1);
    renderRoutineEditor();
  });

  head.append(name, removeEx);
  block.append(head);

  const grid = document.createElement("div");
  grid.className = "sets-grid sets-grid--template";
  for (const label of ["SET", "LBS", "REPS", ""]) {
    const cell = document.createElement("div");
    cell.className = "sets-grid-head";
    cell.textContent = label;
    grid.append(cell);
  }

  entry.sets.forEach((set, setIndex) => {
    const num = document.createElement("div");
    num.className = "set-num";
    num.textContent = String(setIndex + 1);

    const weight = document.createElement("input");
    weight.className = "set-input";
    weight.type = "text";
    weight.inputMode = "decimal";
    weight.value = set.weight ?? "";
    weight.addEventListener("input", () => {
      const n = parseFloat(weight.value);
      set.weight = Number.isFinite(n) ? n : null;
    });

    const reps = document.createElement("input");
    reps.className = "set-input";
    reps.type = "text";
    reps.inputMode = "numeric";
    reps.value = set.reps ?? "";
    reps.addEventListener("input", () => {
      const n = parseInt(reps.value, 10);
      set.reps = Number.isFinite(n) ? n : null;
    });

    const removeSet = document.createElement("button");
    removeSet.type = "button";
    removeSet.className = "set-remove";
    removeSet.setAttribute("aria-label", "Remove set");
    removeSet.textContent = "✕";
    removeSet.addEventListener("click", () => {
      entry.sets.splice(setIndex, 1);
      renderRoutineEditor();
    });

    grid.append(num, weight, reps, removeSet);
  });

  block.append(grid);

  const addSet = document.createElement("button");
  addSet.type = "button";
  addSet.className = "ghost workout-add-set";
  addSet.textContent = "+ Add Set";
  addSet.addEventListener("click", () => {
    entry.sets.push({ weight: null, reps: null });
    renderRoutineEditor();
  });
  block.append(addSet);

  return block;
}

routineAddExerciseBtn.addEventListener("click", () => {
  openExercises({ onPick: addExerciseToRoutine, returnTo: routineView });
});

function addExerciseToRoutine(ex) {
  editingRoutine.content.exercises.push({
    exercise_id: ex.id,
    name: ex.name,
    sets: [{ weight: null, reps: null }],
  });
  closeExercises();          // back to the routine editor
  renderRoutineEditor();
}

routineSaveBtn.addEventListener("click", async () => {
  const name = routineNameInput.value.trim();
  if (!name) {
    routineNameInput.focus();
    return;
  }
  routineSaveBtn.disabled = true;
  const payload = {
    name,
    content: editingRoutine.content,
    folder_id: editingRoutine.folder_id || null,
    rest_seconds: editingRoutine.rest_seconds ?? null,
  };
  const editing = Boolean(editingRoutine.id);
  try {
    const res = await authFetch(
      editing ? `${ROUTINES_API}/${editingRoutine.id}` : ROUTINES_API,
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) return;
    await loadRoutines();
    closeRoutineEditor();
  } catch (err) {
    /* stay in the editor */
  } finally {
    routineSaveBtn.disabled = false;
  }
});

routineDeleteBtn.addEventListener("click", async () => {
  if (!editingRoutine || !editingRoutine.id) return;
  if (!confirm(`Delete routine "${editingRoutine.name}"?`)) return;
  routineDeleteBtn.disabled = true;
  try {
    const res = await authFetch(`${ROUTINES_API}/${editingRoutine.id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) return;
    await loadRoutines();
    closeRoutineEditor();
  } catch (err) {
    /* stay in the editor */
  } finally {
    routineDeleteBtn.disabled = false;
  }
});

routineBackBtn.addEventListener("click", () => {
  if (!editingRoutine) {
    closeRoutineEditor();
    return;
  }
  editingRoutine.name = routineNameInput.value;
  const dirty = JSON.stringify(editingRoutine) !== originalRoutineJSON;
  if (dirty && !confirm("Discard changes to this routine?")) return;
  closeRoutineEditor();
});

// --- History ---------------------------------------------------------
function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtVolume(v) {
  return `${Number.isInteger(v) ? v : Math.round(v)} lb`;
}

function routineName(routineId) {
  const r = routines.find((x) => x.id === routineId);
  return r ? r.name : "Workout";
}

// Where the history detail was opened from, so its back button returns there.
let historyDetailFrom = home;

homeHistoryMoreBtn.addEventListener("click", openHistory);
historyBackBtn.addEventListener("click", () => showView(home));
historyDetailBackBtn.addEventListener("click", () => showView(historyDetailFrom));

// One history entry: a clickable summary that opens the detail, plus a ↻ button
// that starts a brand-new workout pre-filled from this one.
function buildHistoryRow(w) {
  const row = document.createElement("div");
  row.className = "history-row";

  const main = document.createElement("button");
  main.type = "button";
  main.className = "history-row-main";
  const title = document.createElement("span");
  title.className = "history-row-title";
  title.textContent = routineName(w.routine_id);
  const meta = document.createElement("span");
  meta.className = "history-row-meta";
  meta.textContent =
    `${fmtDate(w.finished_at || w.started_at)}  ·  ` +
    `${w.exercise_count} exercise${w.exercise_count === 1 ? "" : "s"}  ·  ` +
    `${w.set_count} set${w.set_count === 1 ? "" : "s"}  ·  ${fmtVolume(w.volume)}`;
  main.append(title, meta);
  main.addEventListener("click", () => openHistoryDetail(w.id));

  const repeat = document.createElement("button");
  repeat.type = "button";
  repeat.className = "history-row-repeat";
  repeat.textContent = "↻";
  repeat.title = "Do this workout again";
  repeat.setAttribute("aria-label", "Repeat this workout");
  repeat.addEventListener("click", () => repeatWorkout(w.id));

  row.append(main, repeat);
  return row;
}

// The 3-row preview at the bottom of the home screen.
async function loadHomeHistory() {
  try {
    const res = await authFetch(WORKOUTS_API + "?limit=3");
    if (!res.ok) { homeHistoryEl.hidden = true; return; }
    const items = await res.json();
    homeHistoryListEl.replaceChildren();
    if (items.length === 0) { homeHistoryEl.hidden = true; return; }
    for (const w of items) homeHistoryListEl.append(buildHistoryRow(w));
    homeHistoryEl.hidden = false;
  } catch (err) {
    homeHistoryEl.hidden = true;
  }
}

function openHistory() {
  showView(historyView);
  loadHistory();
}

async function loadHistory() {
  historyStatusEl.textContent = "Loading…";
  historyListEl.replaceChildren();
  try {
    const res = await authFetch(WORKOUTS_API + "?limit=100");
    if (!res.ok) {
      historyStatusEl.textContent = "Could not load history.";
      return;
    }
    renderHistoryList(await res.json());
  } catch (err) {
    historyStatusEl.textContent = err.message || "Could not reach the server.";
  }
}

function renderHistoryList(items) {
  historyListEl.replaceChildren();
  if (items.length === 0) {
    historyStatusEl.textContent = "No finished workouts yet.";
    return;
  }
  historyStatusEl.textContent = `${items.length} workout${items.length === 1 ? "" : "s"}`;
  for (const w of items) historyListEl.append(buildHistoryRow(w));
}

// Start a fresh workout from a past one.
async function repeatWorkout(workoutId) {
  if (activeWorkout) {
    if (!confirm("You have a workout in progress — open that one instead?")) return;
    openWorkout();
    return;
  }
  try {
    const res = await authFetch(WORKOUTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_workout_id: workoutId }),
    });
    if (!res.ok) return;
    activeWorkout = await res.json();
    openWorkout();
  } catch (err) {
    /* stay put */
  }
}

let historyDetailId = null;

async function openHistoryDetail(id) {
  historyDetailId = id;
  // Remember the origin (home "Recent workouts" row vs the full History list).
  historyDetailFrom = historyView.hidden ? home : historyView;
  showView(historyDetailView);
  historyDetailMetaEl.textContent = "Loading…";
  historyDetailExercisesEl.replaceChildren();
  try {
    const res = await authFetch(`${WORKOUTS_API}/${id}`);
    if (!res.ok) {
      historyDetailMetaEl.textContent = "Could not load this workout.";
      return;
    }
    const w = await res.json();
    historyDetailTitleEl.textContent = routineName(w.routine_id);
    historyDetailMetaEl.textContent = fmtDate(w.finished_at || w.started_at);
    renderWorkoutReadonly(historyDetailExercisesEl, w.content);
  } catch (err) {
    historyDetailMetaEl.textContent = err.message || "Could not reach the server.";
  }
}

historyDetailDeleteBtn.addEventListener("click", async () => {
  if (!historyDetailId) return;
  if (!confirm("Delete this workout? It's removed from history everywhere.")) return;
  historyDetailDeleteBtn.disabled = true;
  try {
    const res = await authFetch(`${WORKOUTS_API}/${historyDetailId}`, { method: "DELETE" });
    if (res.status !== 204 && res.status !== 404) return;
    exerciseStatsCache.clear();   // any exercise's stats may have changed
    showView(historyDetailFrom);
    loadHistory();
    loadHomeHistory();
  } catch (err) {
    /* stay put */
  } finally {
    historyDetailDeleteBtn.disabled = false;
  }
});

// Read-only render of a workout's content -- used by History detail.
function renderWorkoutReadonly(container, content) {
  container.replaceChildren();
  const exercises = (content && content.exercises) || [];

  for (const entry of exercises) {
    const block = document.createElement("div");
    block.className = "workout-exercise";

    const name = document.createElement("div");
    name.className = "workout-exercise-name";
    name.textContent = entry.name;
    block.append(name);

    if (entry.notes) {
      const notes = document.createElement("p");
      notes.className = "exercise-meta";
      notes.textContent = entry.notes;
      block.append(notes);
    }

    const grid = document.createElement("div");
    grid.className = "sets-grid sets-grid--readonly";
    for (const label of ["SET", "LBS", "REPS", ""]) {
      const cell = document.createElement("div");
      cell.className = "sets-grid-head";
      cell.textContent = label;
      grid.append(cell);
    }

    (entry.sets || []).forEach((set, i) => {
      const num = document.createElement("div");
      num.className = "set-num";
      num.textContent = String(i + 1);

      const weight = document.createElement("div");
      weight.className = "set-readonly";
      weight.textContent = set.weight ?? "–";

      const reps = document.createElement("div");
      reps.className = "set-readonly";
      reps.textContent = set.reps ?? "–";

      const mark = document.createElement("div");
      mark.className = "set-readonly";
      const bits = [];
      if (set.done) bits.push("✓");
      if (set.pr_weight || set.pr_1rm) bits.push("🏆");
      mark.textContent = bits.join(" ");

      grid.append(num, weight, reps, mark);
    });

    block.append(grid);
    container.append(block);
  }
}

// --- Settings ------------------------------------------------------------
settingsBtn.addEventListener("click", openSettings);
settingsBackBtn.addEventListener("click", () => showView(home));
settingsChangePwBtn.addEventListener("click", openChangePassword);
settingsDeleteAcctBtn.addEventListener("click", openDeleteAccount);
passwordBackBtn.addEventListener("click", () => showView(settingsView));
deleteBackBtn.addEventListener("click", () => showView(settingsView));

function openSettings() {
  showView(settingsView);
  setNameInput.value = currentUser?.display_name || "";
  setEmailInput.value = currentUser?.email || "";
  setRestInput.value = currentUser?.preferences?.default_rest_seconds ?? 90;
  settingsProfileMsg.textContent = "";
}

function openChangePassword() {
  showView(passwordView);
  setCurPwInput.value = "";
  setNewPwInput.value = "";
  settingsPasswordMsg.textContent = "";
}

function openDeleteAccount() {
  showView(deleteView);
  setDeleteEmailInput.value = "";
  settingsDeleteBtn.disabled = true;
  settingsDeleteMsg.textContent = "";
}

function setMsg(el, text, kind = "error") {
  el.textContent = text;
  el.dataset.kind = kind;
}

settingsProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveBtn = document.getElementById("settings-profile-save");
  saveBtn.disabled = true;
  setMsg(settingsProfileMsg, "");

  const rest = Math.max(0, Math.min(600, parseInt(setRestInput.value, 10) || 0));
  const payload = {
    display_name: setNameInput.value.trim(),
    email: setEmailInput.value.trim(),
    preferences: { default_rest_seconds: rest },
  };
  try {
    const res = await authFetch(API + "/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(settingsProfileMsg, detailToText(data.detail) || "Could not save.");
      return;
    }
    currentUser = data;
    whoEl.textContent = currentUser.display_name;
    setRestInput.value = currentUser.preferences?.default_rest_seconds ?? rest;
    setMsg(settingsProfileMsg, "Saved.", "ok");
  } catch (err) {
    setMsg(settingsProfileMsg, err.message || "Could not reach the server.");
  } finally {
    saveBtn.disabled = false;
  }
});

settingsPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveBtn = document.getElementById("settings-password-save");
  saveBtn.disabled = true;
  setMsg(settingsPasswordMsg, "");

  if (setNewPwInput.value.length < 8) {
    setMsg(settingsPasswordMsg, "New password must be at least 8 characters.");
    saveBtn.disabled = false;
    return;
  }
  try {
    const res = await authFetch(API + "/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: setCurPwInput.value,
        new_password: setNewPwInput.value,
      }),
    });
    if (res.status === 204) {
      setCurPwInput.value = "";
      setNewPwInput.value = "";
      showView(settingsView);
      showToast("Password changed");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setMsg(settingsPasswordMsg, detailToText(data.detail) || "Could not change password.");
  } catch (err) {
    setMsg(settingsPasswordMsg, err.message || "Could not reach the server.");
  } finally {
    saveBtn.disabled = false;
  }
});

settingsExportBtn.addEventListener("click", async () => {
  settingsExportBtn.disabled = true;
  try {
    const res = await authFetch(WORKOUTS_API + "/export.csv");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workout-history.csv";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    /* ignore */
  } finally {
    settingsExportBtn.disabled = false;
  }
});

setDeleteEmailInput.addEventListener("input", () => {
  const match =
    !!currentUser &&
    setDeleteEmailInput.value.trim().toLowerCase() === currentUser.email;
  settingsDeleteBtn.disabled = !match;
});

settingsDeleteBtn.addEventListener("click", async () => {
  if (!confirm("Delete your account? This cannot be undone.")) return;
  settingsDeleteBtn.disabled = true;
  try {
    const res = await authFetch(API + "/me", { method: "DELETE" });
    if (res.status !== 204) {
      setMsg(settingsDeleteMsg, "Could not delete the account.");
      return;
    }
    store.clear();
    currentUser = null;
    showLoggedOut();
  } catch (err) {
    setMsg(settingsDeleteMsg, err.message || "Could not reach the server.");
  } finally {
    settingsDeleteBtn.disabled = false;
  }
});

// --- On load: if we hold either token, try to use it --------------------
if (store.access || store.refresh) {
  // Hide the login / create-account UI straight away so it never flashes
  // before loadProfile() confirms the session and shows the home view.
  form.hidden = true;
  tabsEl.hidden = true;
  loadProfile();
}
