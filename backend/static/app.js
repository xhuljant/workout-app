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
const logoutBtn = document.getElementById("logout");
const passwordInput = document.getElementById("password");
const routineList = document.getElementById("routine-list");
const routineEmpty = document.getElementById("routine-empty");

// Exercises sub-view
const exercisesBtn = document.getElementById("exercises");
const exercisesView = document.getElementById("exercises-view");
const exercisesBack = document.getElementById("exercises-back");
const exerciseSearch = document.getElementById("exercise-search");
const exerciseStatus = document.getElementById("exercise-status");
const exerciseListEl = document.getElementById("exercise-list");
const addExerciseDetails = document.getElementById("add-exercise");
const addExerciseForm = document.getElementById("add-exercise-form");
const addExerciseMessage = document.getElementById("add-exercise-message");
const addExerciseSubmit = document.getElementById("add-exercise-submit");

// Active workout sub-view
const startEmptyBtn = document.getElementById("start-empty");
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
const workoutFab = document.getElementById("workout-fab");
const workoutFabTime = document.getElementById("workout-fab-time");

// Routine editor sub-view
const newRoutineBtn = document.getElementById("new-routine");
const routineView = document.getElementById("routine-view");
const routineTitleEl = document.getElementById("routine-title");
const routineBackBtn = document.getElementById("routine-back");
const routineNameInput = document.getElementById("routine-name");
const routineExercisesEl = document.getElementById("routine-exercises");
const routineEmptyMsg = document.getElementById("routine-empty-msg");
const routineAddExerciseBtn = document.getElementById("routine-add-exercise");
const routineSaveBtn = document.getElementById("routine-save");
const routineDeleteBtn = document.getElementById("routine-delete");

// The user's routines, loaded from the backend after login.
let routines = [];

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

function showLoggedIn(user) {
  form.hidden = true;
  tabsEl.hidden = true;
  exercisesView.hidden = true;   // always land on the home screen
  workoutView.hidden = true;
  routineView.hidden = true;
  home.hidden = false;
  whoEl.textContent = user.display_name;
  loadRoutines();
  loadActiveWorkout();
}

function showLoggedOut() {
  form.hidden = false;
  tabsEl.hidden = false;
  home.hidden = true;
  exercisesView.hidden = true;
  workoutView.hidden = true;
  routineView.hidden = true;
  stopDurationTimer();
  activeWorkout = null;
  updateWorkoutFab();
}

// One row per routine: tap the name to start a workout from it, ▲/▼ to reorder,
// ⋮ to open the editor. A "create one" message shows when there are none.
function renderRoutines() {
  routineList.replaceChildren();
  routineEmpty.hidden = routines.length > 0;

  routines.forEach((routine, i) => {
    const row = document.createElement("div");
    row.className = "routine-row";

    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "routine-name-btn";
    nameBtn.textContent = routine.name;
    nameBtn.addEventListener("click", () => startRoutine(routine));

    const up = document.createElement("button");
    up.type = "button";
    up.className = "routine-move";
    up.textContent = "▲";
    up.setAttribute("aria-label", "Move up");
    up.disabled = i === 0;
    up.addEventListener("click", () => moveRoutine(i, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "routine-move";
    down.textContent = "▼";
    down.setAttribute("aria-label", "Move down");
    down.disabled = i === routines.length - 1;
    down.addEventListener("click", () => moveRoutine(i, 1));

    const menu = document.createElement("button");
    menu.type = "button";
    menu.className = "routine-menu";
    menu.textContent = "⋮";
    menu.setAttribute("aria-label", "Edit routine");
    menu.addEventListener("click", () => openRoutineEditor(routine));

    row.append(nameBtn, up, down, menu);
    routineList.append(row);
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
  home.hidden = true;
  workoutView.hidden = true;
  routineView.hidden = true;
  exercisesView.hidden = false;
  loadExercises("");
}

function closeExercises() {
  exercisesView.hidden = true;
  exercisesReturnTo.hidden = false;
  exercisePickHandler = null;
  exercisesReturnTo = home;
  updateWorkoutFab();
}

exercisesBtn.addEventListener("click", () => openExercises());
exercisesBack.addEventListener("click", closeExercises);

// Load the library (optionally filtered) and render it.
async function loadExercises(query = "") {
  exerciseStatus.textContent = "Loading…";
  exerciseListEl.replaceChildren();
  try {
    const url = query
      ? `${EXERCISES_API}?q=${encodeURIComponent(query)}`
      : EXERCISES_API;
    const res = await authFetch(url);
    if (!res.ok) {
      exerciseStatus.textContent = "Could not load exercises.";
      return;
    }
    const items = await res.json();
    renderExercises(items, query);
  } catch (err) {
    exerciseStatus.textContent = err.message || "Could not reach the server.";
  }
}

function renderExercises(items, query) {
  exerciseListEl.replaceChildren();

  if (items.length === 0) {
    exerciseStatus.textContent = query
      ? `No exercises match “${query}”.`
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

    if ((ex.instructions || []).length) {
      const ol = document.createElement("ol");
      ol.className = "exercise-steps";
      for (const step of ex.instructions) {
        const li = document.createElement("li");
        li.textContent = step;
        ol.append(li);
      }
      row.append(ol);
    }

    exerciseListEl.append(row);
  }
}

// Debounce the search box so we don't fire a request on every keystroke.
let searchTimer;
exerciseSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadExercises(exerciseSearch.value.trim()), 250);
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

  const payload = {
    name,
    category: document.getElementById("ex-category").value.trim() || null,
    equipment: document.getElementById("ex-equipment").value.trim() || null,
    primary_muscles: splitList(document.getElementById("ex-muscles").value, ","),
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
    addExerciseDetails.open = false;
    exerciseSearch.value = data.name;
    await loadExercises(data.name);
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

// On login: find out whether a workout is already in progress.
async function loadActiveWorkout() {
  try {
    const res = await authFetch(WORKOUTS_API + "/active");
    activeWorkout = res.ok ? await res.json() : null;
  } catch (err) {
    activeWorkout = null;
  }
  refreshStartButton();
  updateWorkoutFab();
}

function refreshStartButton() {
  startEmptyBtn.textContent = activeWorkout ? "Resume workout" : "Start empty workout";
}

// The floating button shows only when a workout is active AND the user is on some
// other screen. Also makes sure the duration timer is ticking so its label stays
// live even after a reload lands the user on the home screen.
function updateWorkoutFab() {
  const show = Boolean(activeWorkout) && workoutView.hidden;
  workoutFab.hidden = !show;
  if (show && !durationTimer) startDurationTimer();
}

workoutFab.addEventListener("click", () => openWorkout());

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
  home.hidden = true;
  exercisesView.hidden = true;
  routineView.hidden = true;
  workoutView.hidden = false;
  renderWorkout();
  startDurationTimer();
  updateWorkoutFab();
}

// Back arrow: leave the workout running (it's saved server-side) and go home.
// The duration timer keeps running so the floating button's label stays live.
function closeWorkout() {
  flushWorkoutSave();
  workoutView.hidden = true;
  home.hidden = false;
  refreshStartButton();
  updateWorkoutFab();
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

  const grid = document.createElement("div");
  grid.className = "sets-grid";
  for (const label of ["SET", "LBS", "REPS", "✓", ""]) {
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

    grid.append(num, weight, reps, doneWrap, removeSet);
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

// --- Duration timer ----------------------------------------------------
function startDurationTimer() {
  stopDurationTimer();
  if (!activeWorkout) return;
  const tick = () => {
    if (!activeWorkout) return stopDurationTimer();
    const label = formatDuration(Date.now() - Date.parse(activeWorkout.started_at));
    workoutDurationEl.textContent = label;
    workoutFabTime.textContent = label;
  };
  tick();
  durationTimer = setInterval(tick, 1000);
}

function stopDurationTimer() {
  if (durationTimer) clearInterval(durationTimer);
  durationTimer = null;
  workoutFabTime.textContent = "";
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

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
      body: JSON.stringify({ name: routine.name, content }),
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
  workoutView.hidden = true;
  home.hidden = false;
  refreshStartButton();
  updateWorkoutFab();
}

// --- Routines ----------------------------------------------------------
const ROUTINES_API = "/api/routines";

// The routine currently open in the editor: { id?, name, content }. A deep copy,
// so nothing is saved until the Save button. originalRoutineJSON is the snapshot
// we compare against to detect unsaved changes.
let editingRoutine = null;
let originalRoutineJSON = "";

async function loadRoutines() {
  try {
    const res = await authFetch(ROUTINES_API);
    routines = res.ok ? await res.json() : [];
  } catch (err) {
    routines = [];
  }
  renderRoutines();
}

// Move the routine at index i by dir (-1 up, +1 down) and persist the new order.
async function moveRoutine(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= routines.length) return;
  [routines[i], routines[j]] = [routines[j], routines[i]];
  renderRoutines();
  try {
    const res = await authFetch(ROUTINES_API + "/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: routines.map((r) => r.id) }),
    });
    if (res.ok) routines = await res.json();
  } catch (err) {
    loadRoutines();   // reload the real order if the save failed
  }
  renderRoutines();
}

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
  editingRoutine = routine
    ? { id: routine.id, name: routine.name, content: deepCopy(routine.content) }
    : { name: "", content: { exercises: [] } };
  if (!editingRoutine.content || !Array.isArray(editingRoutine.content.exercises)) {
    editingRoutine.content = { exercises: [] };
  }
  originalRoutineJSON = JSON.stringify(editingRoutine);

  routineTitleEl.textContent = routine ? "Edit Routine" : "New Routine";
  routineNameInput.value = editingRoutine.name;
  routineDeleteBtn.hidden = !routine;

  home.hidden = true;
  workoutView.hidden = true;
  exercisesView.hidden = true;
  routineView.hidden = false;
  renderRoutineEditor();
}

function closeRoutineEditor() {
  editingRoutine = null;
  routineView.hidden = true;
  home.hidden = false;
  updateWorkoutFab();
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

routineNameInput.addEventListener("input", () => {
  if (editingRoutine) editingRoutine.name = routineNameInput.value;
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
  const payload = { name, content: editingRoutine.content };
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

// --- On load: if we hold either token, try to use it --------------------
if (store.access || store.refresh) {
  // Hide the login / create-account UI straight away so it never flashes
  // before loadProfile() confirms the session and shows the home view.
  form.hidden = true;
  tabsEl.hidden = true;
  loadProfile();
}
