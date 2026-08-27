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
  home.hidden = false;
  whoEl.textContent = user.display_name;
  renderRoutines();
}

function showLoggedOut() {
  form.hidden = false;
  tabsEl.hidden = false;
  home.hidden = true;
  exercisesView.hidden = true;
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

function openExercises() {
  home.hidden = true;
  exercisesView.hidden = false;
  loadExercises(exerciseSearch.value.trim());
}

function closeExercises() {
  exercisesView.hidden = true;
  home.hidden = false;
}

exercisesBtn.addEventListener("click", openExercises);
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

// --- On load: if we already hold a token, try to use it -----------------
if (store.access) {
  // Hide the login / create-account UI straight away so it never flashes
  // before loadProfile() confirms the token and shows the home view.
  form.hidden = true;
  tabsEl.hidden = true;
  loadProfile();
}
