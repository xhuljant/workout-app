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

// The user's routines. Empty for now -- nothing creates routines yet. When a
// routines source is added later, fill this array and renderRoutines() shows a
// button per routine with no other change.
const routines = [];

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
  const res = await fetch(API + "/me", {
    headers: { Authorization: "Bearer " + store.access },
  });

  if (!res.ok) {
    // Token missing or expired -> fall back to the login form.
    store.clear();
    showLoggedOut();
    return;
  }

  const user = await res.json();
  showLoggedIn(user);
}

function showLoggedIn(user) {
  form.hidden = true;
  tabsEl.hidden = true;
  exercisesView.hidden = true;   // always land on the home screen
  workoutView.hidden = true;
  home.hidden = false;
  whoEl.textContent = user.display_name;
  renderRoutines();
  loadActiveWorkout();
}

function showLoggedOut() {
  form.hidden = false;
  tabsEl.hidden = false;
  home.hidden = true;
  exercisesView.hidden = true;
  workoutView.hidden = true;
  stopDurationTimer();
  activeWorkout = null;
}

// Show a button per routine, or a "create one" message when there are none.
function renderRoutines() {
  routineList.replaceChildren();

  if (routines.length === 0) {
    routineEmpty.hidden = false;
    return;
  }

  routineEmpty.hidden = true;
  for (const name of routines) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action routine";
    btn.textContent = name;
    routineList.append(btn);
  }
}

logoutBtn.addEventListener("click", () => {
  store.clear();
  showLoggedOut();
  showMessage("");
});

// --- Exercises --------------------------------------------------------------
const EXERCISES_API = "/api/exercises";

// fetch() with the access token attached. On a 401 the token is dead, so we
// clear it and drop back to the login form.
async function authFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + store.access },
  });
  if (res.status === 401) {
    store.clear();
    showLoggedOut();
    throw new Error("Session expired. Please log in again.");
  }
  return res;
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
  home.hidden = true;
  workoutView.hidden = true;
  exercisesView.hidden = false;
  loadExercises(exerciseSearch.value.trim());
}

function closeExercises() {
  exercisesView.hidden = true;
  exercisesReturnTo.hidden = false;
  exercisePickHandler = null;
  exercisesReturnTo = home;
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
}

function refreshStartButton() {
  startEmptyBtn.textContent = activeWorkout ? "Resume workout" : "Start empty workout";
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
  home.hidden = true;
  exercisesView.hidden = true;
  workoutView.hidden = false;
  renderWorkout();
  startDurationTimer();
}

// Back arrow: leave the workout running (it's saved server-side) and go home.
function closeWorkout() {
  flushWorkoutSave();
  stopDurationTimer();
  workoutView.hidden = true;
  home.hidden = false;
  refreshStartButton();
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
  const tick = () => {
    const started = Date.parse(activeWorkout.started_at);
    workoutDurationEl.textContent = formatDuration(Date.now() - started);
  };
  tick();
  durationTimer = setInterval(tick, 1000);
}

function stopDurationTimer() {
  if (durationTimer) clearInterval(durationTimer);
  durationTimer = null;
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
    const res = await authFetch(WORKOUTS_API + "/active/finish", { method: "POST" });
    if (!res.ok) return;
    endWorkoutUI();
  } catch (err) {
    /* stay on the workout screen */
  } finally {
    workoutFinishBtn.disabled = false;
  }
});

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
}

// --- On load: if we already hold a token, try to use it -----------------
if (store.access) {
  // Hide the login / create-account UI straight away so it never flashes
  // before loadProfile() confirms the token and shows the home view.
  form.hidden = true;
  tabsEl.hidden = true;
  loadProfile();
}
