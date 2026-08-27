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
  home.hidden = false;
  whoEl.textContent = user.display_name;
  renderRoutines();
}

function showLoggedOut() {
  form.hidden = false;
  tabsEl.hidden = false;
  home.hidden = true;
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

// --- On load: if we already hold a token, try to use it -----------------
if (store.access) {
  loadProfile();
}
