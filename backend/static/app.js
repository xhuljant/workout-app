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

// Reset-with-recovery-code + the one-time recovery-code screen (peers of the
// auth form, shown on the logged-out screen).
const forgotRow = document.getElementById("forgot-row");
const forgotLink = document.getElementById("forgot-link");
const resetView = document.getElementById("reset-view");
const resetForm = document.getElementById("reset-form");
const resetEmailInput = document.getElementById("reset-email");
const resetCodeInput = document.getElementById("reset-code");
const resetNewPwInput = document.getElementById("reset-new-pw");
const resetMsg = document.getElementById("reset-msg");
const resetBackBtn = document.getElementById("reset-back");
const recoveryCodeView = document.getElementById("recovery-code-view");
const recoveryCodeValue = document.getElementById("recovery-code-value");
const recoveryCodeCopyBtn = document.getElementById("recovery-code-copy");
const recoveryCodeContinueBtn = document.getElementById("recovery-code-continue");
let recoveryCodeOnContinue = null;
const home = document.getElementById("home");
const whoEl = document.getElementById("who");
const menuBtn = document.getElementById("menu-btn");
const sideMenu = document.getElementById("side-menu");
const menuCloseBtn = document.getElementById("menu-close");
const menuSettingsBtn = document.getElementById("menu-settings");
const logoutBtn = document.getElementById("menu-logout");
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
const exercisePickBar = document.getElementById("exercise-pick-bar");
const exercisePickAddBtn = document.getElementById("exercise-pick-add");
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

// Calendar sub-view (opened from the ☰ menu)
const menuCalendarBtn = document.getElementById("menu-calendar");
const calendarView = document.getElementById("calendar-view");
const calendarBackBtn = document.getElementById("calendar-back");
const calendarStatusEl = document.getElementById("calendar-status");
const calendarScrollEl = document.getElementById("calendar-scroll");
const dayPickerEl = document.getElementById("day-picker");
const dayPickerTitleEl = document.getElementById("day-picker-title");
const dayPickerListEl = document.getElementById("day-picker-list");
const dayPickerCancelBtn = document.getElementById("day-picker-cancel");

// Measurements sub-view (opened from the ☰ menu)
const menuMeasurementsBtn = document.getElementById("menu-measurements");
const measurementsView = document.getElementById("measurements-view");
const measurementsBackBtn = document.getElementById("measurements-back");
const measurementsAddBtn = document.getElementById("measurements-add-btn");
const measurementsChartEl = document.getElementById("measurements-chart");
const measurementsFilterEl = document.getElementById("measurements-filter");
const measurementsStatusEl = document.getElementById("measurements-status");
const measurementsListEl = document.getElementById("measurements-list");
const measurementEditorView = document.getElementById("measurement-editor-view");
const measurementEditorBackBtn = document.getElementById("measurement-editor-back");
const measurementEditBtn = document.getElementById("measurement-editor-edit-btn");
const measurementEditorTitleEl = document.getElementById("measurement-editor-title");
const measurementForm = document.getElementById("measurement-form");
const measurementDateInput = document.getElementById("measurement-date");
const measurementFieldsEl = document.getElementById("measurement-fields");
const measurementPhotoInput = document.getElementById("measurement-photo");
const measurementPhotosEl = document.getElementById("measurement-photos");
const measurementMsgEl = document.getElementById("measurement-msg");
const measurementSaveBtn = document.getElementById("measurement-save");
const measurementDeleteBtn = document.getElementById("measurement-delete");
const measurementPhotoViewerEl = document.getElementById("measurement-photo-viewer");
const measurementPhotoViewerImg = document.getElementById("measurement-photo-viewer-img");

// Settings sub-view (+ its Change password / Delete account pages)
const settingsView = document.getElementById("settings-view");
const settingsBackBtn = document.getElementById("settings-back");
const settingsProfileForm = document.getElementById("settings-profile-form");
const settingsProfileMsg = document.getElementById("settings-profile-msg");
const setNameInput = document.getElementById("set-name");
const setEmailInput = document.getElementById("set-email");
const setRestInput = document.getElementById("set-rest");
const setUnitsSelect = document.getElementById("set-units");
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

// Full JSON backup export / import (Settings)
const settingsExportJsonBtn = document.getElementById("settings-export-json");
const settingsImportBtn = document.getElementById("settings-import-btn");
const settingsImportFile = document.getElementById("settings-import-file");
const settingsDataMsg = document.getElementById("settings-data-msg");

// Trash sub-view (opened from the ☰ menu)
const menuTrashBtn = document.getElementById("menu-trash");
const trashView = document.getElementById("trash-view");
const trashBackBtn = document.getElementById("trash-back");
const trashStatusEl = document.getElementById("trash-status");
const trashListEl = document.getElementById("trash-list");

// Active-workout save status line
const workoutSaveStateEl = document.getElementById("workout-save-state");

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
  forgotRow.hidden = registering;                        // "Forgot password?" is a login-only affordance
  showMessage("");                                       // clear any old error
}

// --- Reset with recovery code + the one-time code screen --------------------
// Logged-out screens sharing the card: the auth form, #reset-view (email +
// recovery code + new password), and #recovery-code-view (shows a code once).

function showAuthLogin() {
  resetView.hidden = true;
  recoveryCodeView.hidden = true;
  recoveryCodeOnContinue = null;
  form.hidden = false;
  tabsEl.hidden = false;
  setMode("login");
}

function showResetView() {
  form.hidden = true;
  tabsEl.hidden = true;
  recoveryCodeView.hidden = true;
  resetView.hidden = false;
  resetMsg.textContent = "";
  resetEmailInput.value = document.getElementById("email").value.trim();
  resetCodeInput.value = "";
  resetNewPwInput.value = "";
}

// Show `code` on the one-time screen; `onContinue` runs when the user confirms.
function showRecoveryCode(code, onContinue) {
  recoveryCodeOnContinue = onContinue;
  recoveryCodeValue.textContent = code;
  recoveryCodeCopyBtn.textContent = "Copy code";
  form.hidden = true;
  tabsEl.hidden = true;
  resetView.hidden = true;
  recoveryCodeView.hidden = false;
}

forgotLink.addEventListener("click", showResetView);
resetBackBtn.addEventListener("click", showAuthLogin);

recoveryCodeCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(recoveryCodeValue.textContent);
    recoveryCodeCopyBtn.textContent = "Copied";
  } catch (err) {
    recoveryCodeCopyBtn.textContent = "Copy failed — select it manually";
  }
});

recoveryCodeContinueBtn.addEventListener("click", () => {
  const go = recoveryCodeOnContinue;
  recoveryCodeOnContinue = null;
  recoveryCodeView.hidden = true;
  if (go) go();
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = document.getElementById("reset-submit");
  if (resetNewPwInput.value.length < 8) {
    setMsg(resetMsg, "Password must be at least 8 characters.");
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch(API + "/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetEmailInput.value.trim(),
        recovery_code: resetCodeInput.value.trim(),
        new_password: resetNewPwInput.value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      store.clear();                    // any old tokens are dead now anyway
      showRecoveryCode(data.recovery_code, () => {
        showAuthLogin();
        showMessage("Password updated. Log in with your new password.", "ok");
      });
      return;
    }
    setMsg(resetMsg, detailToText(data.detail) || "Could not reset password.");
  } catch (err) {
    setMsg(resetMsg, "Could not reach the server.");
  } finally {
    btn.disabled = false;
  }
});

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

    if (data.recovery_code) {
      // Fresh sign-up: make the user save their one-time recovery code before
      // dropping them onto the home screen. They're already logged in.
      showRecoveryCode(data.recovery_code, () => loadProfile());
    } else {
      await loadProfile();    // prove the access token actually works
    }
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
let profileRetries = 0;
async function loadProfile() {
  try {
    const res = await authFetch(API + "/me");   // authFetch refreshes a stale token
    if (!res.ok) {
      store.clear();
      showLoggedOut();
      return;
    }
    profileRetries = 0;
    showLoggedIn(await res.json());
  } catch (err) {
    if (err instanceof TransientNetworkError && profileRetries < 5) {
      // Server unreachable, but the tokens may be perfectly valid -- don't log
      // the user out. Back off and try again.
      profileRetries += 1;
      setTimeout(loadProfile, 3000);
      return;
    }
    if (err instanceof TransientNetworkError) {
      // Gave up retrying -- show the login form so the screen isn't stuck blank,
      // but KEEP the tokens so a refresh reconnects without re-entering a password.
      form.hidden = false;
      tabsEl.hidden = false;
      showMessage("Can't reach the server. Check your connection and reload.");
      return;
    }
    // authFetch already cleared tokens + showed the login form on a hard 401.
    showLoggedOut();
  }
}

// The mutually-exclusive top-level screens. Every navigation goes through
// showView() so exactly one is ever visible.
const ALL_VIEWS = [
  home, exercisesView, exerciseCreateView, workoutView, routineView,
  historyView, historyDetailView, calendarView, measurementsView,
  measurementEditorView, settingsView, passwordView, deleteView, trashView,
];

function showView(el) {
  for (const v of ALL_VIEWS) v.hidden = v !== el;
  // The ☰ menu button lives in the shared header but only makes sense on home.
  menuBtn.hidden = el !== home;
  // Leaving the workout screen only detaches the bar -- the countdown keeps
  // running and re-appears when you come back.
  if (el !== workoutView) hideRestTimer();

  // Play a short enter animation on the screen we just revealed. Removing then
  // re-adding the class (with a forced reflow between) restarts it on rapid nav.
  el.classList.remove("view-enter");
  void el.offsetWidth;
  el.classList.add("view-enter");
}

// Fixed-overlay show/hide with an enter + exit animation. The element must be
// hidden via the `hidden` attribute; CSS animates `.overlay-in` / `.overlay-out`.
// A per-element token makes a reopen safely cancel an in-flight close.
function openOverlay(el) {
  el._ovToken = (el._ovToken || 0) + 1;
  if (el._ovTimer) { clearTimeout(el._ovTimer); el._ovTimer = null; }
  el.classList.remove("overlay-out");
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("overlay-in");
}
function closeOverlay(el) {
  if (el.hidden) return;
  const token = el._ovToken = (el._ovToken || 0) + 1;
  el.classList.remove("overlay-in");
  el.classList.add("overlay-out");
  const finish = () => {
    if (el._ovToken !== token) return;   // a reopen superseded this close
    el.removeEventListener("animationend", onEnd);
    if (el._ovTimer) { clearTimeout(el._ovTimer); el._ovTimer = null; }
    el.hidden = true;
    el.classList.remove("overlay-out");
  };
  const onEnd = (e) => { if (e.target === el) finish(); };
  el.addEventListener("animationend", onEnd);
  el._ovTimer = setTimeout(finish, 280);   // fallback: reduced motion / missed event
}

// --- App-styled confirm / prompt (replaces window.confirm / window.prompt) ---
const confirmDialogEl = document.getElementById("confirm-dialog");
const confirmTitleEl = document.getElementById("confirm-title");
const confirmBodyEl = document.getElementById("confirm-body");
const confirmInputEl = document.getElementById("confirm-input");
const confirmOkBtn = document.getElementById("confirm-ok");
const confirmCancelBtn = document.getElementById("confirm-cancel");
let confirmResolve = null;

// appConfirm({title, body, confirmLabel, cancelLabel, danger, prompt})
//   -> Promise. Without `prompt`: resolves true / false.
//      With `prompt: {value, placeholder}`: resolves the trimmed string, or null.
function appConfirm({
  title,
  body = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  prompt = null,
} = {}) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmTitleEl.textContent = title || "";
    confirmBodyEl.textContent = body;
    confirmOkBtn.textContent = confirmLabel;
    confirmCancelBtn.textContent = cancelLabel;
    confirmOkBtn.classList.toggle("btn-danger", danger);
    confirmOkBtn.classList.toggle("submit", !danger);

    if (prompt) {
      confirmInputEl.hidden = false;
      confirmInputEl.value = prompt.value || "";
      confirmInputEl.placeholder = prompt.placeholder || "";
    } else {
      confirmInputEl.hidden = true;
      confirmInputEl.value = "";
    }

    openOverlay(confirmDialogEl);
    setTimeout(() => (prompt ? confirmInputEl : confirmOkBtn).focus(), 50);
  });
}

function resolveConfirm(value) {
  if (!confirmResolve) return;
  const done = confirmResolve;
  confirmResolve = null;
  closeOverlay(confirmDialogEl);
  done(value);
}

confirmOkBtn.addEventListener("click", () => {
  resolveConfirm(confirmInputEl.hidden ? true : confirmInputEl.value.trim());
});
confirmCancelBtn.addEventListener("click", () => {
  resolveConfirm(confirmInputEl.hidden ? false : null);
});
confirmDialogEl.addEventListener("click", (e) => {
  if (e.target === confirmDialogEl) resolveConfirm(confirmInputEl.hidden ? false : null);
});
document.addEventListener("keydown", (e) => {
  if (confirmDialogEl.hidden) return;
  if (e.key === "Escape") resolveConfirm(confirmInputEl.hidden ? false : null);
  else if (e.key === "Enter" && !confirmInputEl.hidden) {
    resolveConfirm(confirmInputEl.value.trim());
  }
});

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
  resetView.hidden = true;
  recoveryCodeView.hidden = true;
  recoveryCodeOnContinue = null;
  for (const v of ALL_VIEWS) v.hidden = true;
  menuBtn.hidden = true;
  closeSideMenu();
  stopDurationTimer();
  endRestTimer();
  activeWorkout = null;
  resetWorkoutSaveState();   // stop retries; keep any WAL entry for next login
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

        const rTitle = document.createElement("span");
        rTitle.className = "routine-name-title";
        rTitle.textContent = routine.name;

        const rSub = document.createElement("span");
        rSub.className = "routine-name-sub";
        const exNames = ((routine.content && routine.content.exercises) || [])
          .map((e) => e.name)
          .filter(Boolean);
        rSub.textContent = exNames.length
          ? exNames.slice(0, 6).join(" · ") +
            (exNames.length > 6 ? `  +${exNames.length - 6}` : "")
          : "No exercises yet";

        nameBtn.append(rTitle, rSub);
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
  closeSideMenu();
  store.clear();
  showLoggedOut();
  showMessage("");
});

// --- Exercises --------------------------------------------------------------
const EXERCISES_API = "/api/exercises";

// Thrown when a request can't be completed for a reason that is NOT "the session
// is dead" -- offline, a 5xx, a refresh that timed out. Callers that hold unsaved
// data (saveWorkout) catch this, keep their local copy, and retry later. It must
// never bounce the user to the login screen.
class TransientNetworkError extends Error {}

// Swap the refresh token for a fresh access + refresh pair. Deduped so a burst of
// parallel 401s only triggers one refresh request. Resolves to:
//   "ok"        -- new tokens stored
//   "dead"      -- the refresh token was rejected (401/403); the session is over
//   "transient" -- couldn't tell (offline / 5xx); tokens left untouched
let refreshInFlight = null;
function refreshSession() {
  if (!store.refresh) return Promise.resolve("dead");
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      // One retry on a transient failure before giving up as "transient".
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(API + "/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: store.refresh }),
          });
          if (res.ok) {
            store.set(await res.json());
            return "ok";
          }
          if (res.status === 401 || res.status === 403) return "dead";
          // 5xx / anything else -> transient; wait a moment and retry once.
        } catch (err) {
          // network error -> transient
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      return "transient";
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// fetch() with the access token attached. On a 401 we try to refresh the session
// once and retry. A *rejected* refresh drops back to the login form; a refresh
// that merely couldn't be reached raises TransientNetworkError instead, so a
// server blip or lost connection never logs the user out mid-workout.
async function authFetch(path, options = {}, retried = false) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: "Bearer " + store.access },
    });
  } catch (err) {
    throw new TransientNetworkError("Could not reach the server.");
  }

  if (res.status !== 401) return res;

  if (!retried) {
    const outcome = await refreshSession();
    if (outcome === "ok") return authFetch(path, options, true);
    if (outcome === "transient") {
      throw new TransientNetworkError("Could not reach the server.");
    }
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
// While picking: the chosen exercise ids, in tap order. Committed all at once.
let pickSelectedIds = [];

// Show/refresh the "Add N exercises" bar (visible only in picker mode).
function updatePickBar() {
  const picking = !!exercisePickHandler;
  exercisePickBar.hidden = !picking;
  const n = pickSelectedIds.length;
  exercisePickAddBtn.textContent = n
    ? `Add ${n} exercise${n === 1 ? "" : "s"}`
    : "Select exercises to add";
  exercisePickAddBtn.disabled = !n;
}

// openExercises()                      -> browse the library from the home screen
// openExercises({ onPick, returnTo })  -> pick exercises for another view.
//   onPick is called ONCE with an array of the chosen exercise objects.
function openExercises({ onPick = null, returnTo = home } = {}) {
  exercisePickHandler = onPick;
  exercisesReturnTo = returnTo;
  pickSelectedIds = [];
  exerciseSearch.value = "";        // always start a fresh search
  filterEquipmentSel.value = "";
  filterMuscleSel.value = "";
  filterEquipmentSel.classList.remove("is-active");
  filterMuscleSel.classList.remove("is-active");
  updatePickBar();
  showView(exercisesView);
  loadExercises();
}

function closeExercises() {
  const back = exercisesReturnTo;
  exercisePickHandler = null;
  exercisesReturnTo = home;
  pickSelectedIds = [];
  updatePickBar();
  showView(back);
}

exercisePickAddBtn.addEventListener("click", () => {
  if (!exercisePickHandler || !pickSelectedIds.length) return;
  const byId = new Map(allExercises.map((e) => [e.id, e]));
  const chosen = pickSelectedIds.map((id) => byId.get(id)).filter(Boolean);
  exercisePickHandler(chosen);   // handler does the appends + closeExercises + render
});

exercisesBtn.addEventListener("click", () => openExercises());
exercisesBack.addEventListener("click", closeExercises);

// null = creating a new exercise; a uuid = editing that custom exercise.
let editingExerciseId = null;

// Open the shared create/edit form. Pass an exercise to edit it, or nothing to
// add a new one.
function openExerciseEditor(ex = null) {
  addExerciseForm.reset();
  addExerciseMessage.textContent = "";
  editingExerciseId = ex ? ex.id : null;

  const title = document.getElementById("exercise-create-title");
  if (ex) {
    document.getElementById("ex-name").value = ex.name || "";
    document.getElementById("ex-tracking").value =
      TRACKING[ex.tracking_type] ? ex.tracking_type : "weight_reps";
    document.getElementById("ex-category").value = ex.category || "";
    document.getElementById("ex-equipment").value = ex.equipment || "";
    document.getElementById("ex-muscles").value = (ex.primary_muscles || []).join(", ");
    document.getElementById("ex-secondary-muscles").value =
      (ex.secondary_muscles || []).join(", ");
    document.getElementById("ex-instructions").value =
      (ex.instructions || []).join("\n");
    title.textContent = "Edit exercise";
    addExerciseSubmit.textContent = "Save changes";
  } else {
    title.textContent = "New exercise";
    addExerciseSubmit.textContent = "Save exercise";
  }

  showView(exerciseCreateView);
  document.getElementById("ex-name").focus();
}

exerciseAddBtn.addEventListener("click", () => openExerciseEditor(null));
exerciseCreateBackBtn.addEventListener("click", () => {
  editingExerciseId = null;
  showView(exercisesView);
});

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
attachSuggest(document.getElementById("ex-secondary-muscles"), () => muscleOptions, { multi: true });

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

  // Picker mode: rows toggle a selection; the "Add N" bar commits them all.
  if (exercisePickHandler) {
    for (const ex of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exercise-pick";
      btn.classList.toggle("exercise-pick--selected", pickSelectedIds.includes(ex.id));

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

      const check = document.createElement("span");
      check.className = "exercise-pick-check";
      check.textContent = "✓";
      btn.append(check);

      btn.addEventListener("click", () => {
        const i = pickSelectedIds.indexOf(ex.id);
        if (i >= 0) pickSelectedIds.splice(i, 1);
        else pickSelectedIds.push(ex.id);
        btn.classList.toggle("exercise-pick--selected", pickSelectedIds.includes(ex.id));
        updatePickBar();
      });
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

  // Custom exercises can be edited or deleted by anyone (the library is shared);
  // seeded library rows are read-only. Shown even with no history yet.
  if (ex.is_custom) {
    const actions = document.createElement("div");
    actions.className = "exercise-detail-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "ghost";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openExerciseEditor(ex));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "link-danger";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (!(await appConfirm({
        title: "Delete exercise?",
        body: "Removed from the library and from any routines that use it.",
        confirmLabel: "Delete",
        danger: true,
      }))) return;
      try {
        const res = await authFetch(`${EXERCISES_API}/${ex.id}`, { method: "DELETE" });
        if (res.status !== 204 && res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          showToast(detailToText(data.detail) || "Could not delete the exercise.");
          return;
        }
        exerciseStatsCache.delete(ex.id);
        await loadExercises();
        loadRoutines();
        showToast("Exercise deleted");
      } catch (err) {
        /* ignore -- authFetch already handled a dead session */
      }
    });

    actions.append(edit, del);
    body.append(actions);
  }

  if (!stats.performed_count) {
    const p = document.createElement("p");
    p.className = "exercise-empty";
    p.textContent = "No history for this exercise yet.";
    body.append(p);
    return;
  }

  const mode = TRACKING[stats.tracking_type] ? stats.tracking_type : "weight_reps";
  const lb = (n) => (n == null ? "—" : `${fmtVolume(n)}`);

  const grid = document.createElement("div");
  grid.className = "exercise-stats";
  if (mode === "weight_reps") {
    grid.append(
      statTile("Heaviest set",
        stats.heaviest_weight == null ? "—"
          : `${stats.heaviest_weight} × ${stats.heaviest_weight_reps ?? "–"}`),
      statTile("Best est. 1RM", stats.best_1rm == null ? "—" : `~${lb(stats.best_1rm)}`),
      statTile("Most reps",
        stats.most_reps == null ? "—"
          : `${stats.most_reps} × ${stats.most_reps_weight ?? "–"}`),
      statTile("Best session vol.", lb(stats.best_session_volume)),
      statTile("Total volume", lb(stats.total_volume)),
      statTile("Sessions", String(stats.performed_count)),
    );
  } else if (mode === "reps") {
    grid.append(
      statTile("Best set", stats.most_reps == null ? "—" : `${stats.most_reps} reps`),
      statTile("Total reps", stats.total_reps == null ? "—" : String(stats.total_reps)),
      statTile("Sessions", String(stats.performed_count)),
      statTile("Last", stats.last_performed ? fmtDate(stats.last_performed) : "—"),
    );
  } else if (mode === "time") {
    grid.append(
      statTile("Longest", stats.longest_seconds == null ? "—" : fmtTime(stats.longest_seconds)),
      statTile("Total time", stats.total_seconds == null ? "—" : fmtTime(stats.total_seconds)),
      statTile("Sessions", String(stats.performed_count)),
      statTile("Last", stats.last_performed ? fmtDate(stats.last_performed) : "—"),
    );
  } else {
    grid.append(
      statTile("Farthest", fmtMiles(stats.farthest_distance)),
      statTile("Best pace", fmtPace(stats.best_pace)),
      statTile("Longest", stats.longest_seconds == null ? "—" : fmtTime(stats.longest_seconds)),
      statTile("Total distance", fmtMiles(stats.total_distance)),
      statTile("Total time", stats.total_seconds == null ? "—" : fmtTime(stats.total_seconds)),
      statTile("Sessions", String(stats.performed_count)),
    );
  }
  body.append(grid);

  const CHART = {
    weight_reps:  { key: "top_weight",   fmt: (n) => String(Math.round(n)) },
    reps:         { key: "top_reps",     fmt: (n) => String(Math.round(n)) },
    time:         { key: "top_seconds",  fmt: fmtTime },
    distance_time:{ key: "top_distance", fmt: (n) => n.toFixed(1) },
  }[mode];
  if (stats.sessions.length >= 2) {
    const chart = buildExerciseChart(stats.sessions, CHART.key, CHART.fmt);
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
    main.textContent = `${fmtDate(s.date)}  ·  ${setSummary(
      { weight: s.top_weight, reps: s.top_reps, seconds: s.top_seconds, distance: s.top_distance },
      mode,
    )}` + (mode === "weight_reps" ? `  ·  ${fmtVolume(s.volume)}` : "");

    const del = document.createElement("button");
    del.type = "button";
    del.className = "exercise-session-del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Delete this workout");
    del.addEventListener("click", async () => {
      if (!(await appConfirm({
        title: "Delete workout?",
        body: "It's removed from your history everywhere.",
        confirmLabel: "Delete",
        danger: true,
      }))) return;
      try {
        const res = await authFetch(`${WORKOUTS_API}/${s.workout_id}`, { method: "DELETE" });
        if (res.status !== 204 && res.status !== 404) return;
        exerciseStatsCache.delete(ex.id);
        loadExerciseDetail(ex, body);
        loadHomeHistory();
        showToast("Workout deleted", {
          actionLabel: "Undo",
          onAction: async () => {
            try {
              await authFetch(`${WORKOUTS_API}/${s.workout_id}/restore`, { method: "POST" });
            } catch (err) { /* ignore */ }
            exerciseStatsCache.delete(ex.id);
            loadExerciseDetail(ex, body);
            loadHomeHistory();
          },
        });
      } catch (err) {
        /* ignore */
      }
    });

    rowEl.append(main, del);
    list.append(rowEl);
  });
  body.append(list);
}

// Inline-SVG line chart of one per-session metric (oldest -> newest).
function buildExerciseChart(sessions, key = "top_weight", fmtY = (n) => String(Math.round(n))) {
  const pts = sessions
    .map((s) => ({ date: s.date, y: s[key] }))
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
  label(2, y(max) + 3, fmtY(max));
  label(2, y(min) + 3, fmtY(min));
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

// Create a new custom exercise, or save edits to an existing one. Either way the
// list is reloaded so it (and everyone else) sees the change.
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

  const lowerList = (id) =>
    splitList(document.getElementById(id).value, ",").map((m) => m.toLowerCase());

  // The taxonomy fields are lower-cased so custom entries line up with the
  // seeded library (which is all lower-case) and the filters don't fragment.
  const payload = {
    name,
    tracking_type: document.getElementById("ex-tracking").value,
    category: document.getElementById("ex-category").value.trim().toLowerCase() || null,
    equipment: document.getElementById("ex-equipment").value.trim().toLowerCase() || null,
    primary_muscles: lowerList("ex-muscles"),
    secondary_muscles: lowerList("ex-secondary-muscles"),
    instructions: splitList(document.getElementById("ex-instructions").value, "\n"),
  };

  const editing = editingExerciseId != null;

  try {
    const res = await authFetch(
      editing ? `${EXERCISES_API}/${editingExerciseId}` : EXERCISES_API,
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      addExerciseMessage.textContent =
        detailToText(data.detail) ||
        (editing ? "Could not save the exercise." : "Could not add the exercise.");
      return;
    }

    if (editing) exerciseStatsCache.delete(editingExerciseId);
    editingExerciseId = null;
    addExerciseForm.reset();
    showView(exercisesView);
    await loadExercises();           // pick up the change + refreshed filters
    if (editing) loadRoutines();     // routine displays may reference it
    exerciseSearch.value = data.name || name;
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

// --- Exercise tracking modes ---------------------------------------------
const TRACKING = {
  weight_reps:  { fields: ["weight", "reps"],     heads: ["LBS", "REPS"] },
  reps:         { fields: ["reps"],               heads: ["REPS"] },
  time:         { fields: ["seconds"],            heads: ["TIME"] },
  distance_time:{ fields: ["distance", "seconds"], heads: ["MI", "TIME"] },
};

function trackingOf(entry) {
  const t = entry && entry.tracking_type;
  return TRACKING[t] ? t : "weight_reps";
}

function emptySetFor(mode, extra = {}) {
  const s = { ...extra };
  for (const f of (TRACKING[mode] || TRACKING.weight_reps).fields) s[f] = null;
  return s;
}

function parseTime(v) {
  v = String(v == null ? "" : v).trim();
  if (!v) return null;
  if (v.includes(":")) {
    let sec = 0;
    for (const p of v.split(":")) sec = sec * 60 + (parseInt(p, 10) || 0);
    return sec || null;
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
const fmtTime = (sec) => formatDuration((Number(sec) || 0) * 1000);
const fmtMiles = (n) => (n == null ? "–" : `${Number(n).toFixed(1)} mi`);
const fmtPace = (secPerMi) =>
  secPerMi == null ? "–" : `${formatDuration(secPerMi * 1000)} /mi`;

// Per-metric input behaviour.
const FIELD_META = {
  weight:   { mode: "decimal", parse: (v) => numOrNull(parseFloat(v)), show: (v) => v ?? "" },
  reps:     { mode: "numeric", parse: (v) => numOrNull(parseInt(v, 10)), show: (v) => v ?? "" },
  distance: { mode: "decimal", parse: (v) => numOrNull(parseFloat(v)), show: (v) => v ?? "" },
  seconds:  { mode: "numeric", parse: parseTime, show: (v) => (v == null ? "" : fmtTime(v)) },
};
const numOrNull = (n) => (Number.isFinite(n) ? n : null);

// Compact one-line summary of a set for the PREV column / read-only views.
function setSummary(set, mode) {
  if (!set) return "–";
  mode = TRACKING[mode] ? mode : "weight_reps";
  if (mode === "weight_reps") {
    if (set.weight == null && set.reps == null) return "–";
    return `${set.weight ?? "–"}×${set.reps ?? "–"}`;
  }
  if (mode === "reps") return set.reps == null ? "–" : String(set.reps);
  if (mode === "time") return set.seconds == null ? "–" : fmtTime(set.seconds);
  if (set.distance == null && set.seconds == null) return "–";
  return `${set.distance == null ? "–" : Number(set.distance).toFixed(1) + "mi"}·${
    set.seconds == null ? "–" : fmtTime(set.seconds)
  }`;
}

// The CSS grid-template-columns for a sets grid of a given mode.
//   withPrev/withDone add the PREV and ✓ columns (workout view only).
function setsGridCols(mode, { withPrev = true, withDone = true } = {}) {
  const t = TRACKING[mode] || TRACKING.weight_reps;
  return [
    "1.7rem",
    ...(withPrev ? ["3.6rem"] : []),
    ...t.fields.map(() => "minmax(0, 1fr)"),
    ...(withDone ? ["2.75rem"] : []),   // the ✓ cell is a 44px tap target
    withDone ? "1.6rem" : "1.2rem",     // remove ✕ -- roomier in the live workout
  ].join(" ");
}
function anyPr(set) {
  return !!(set.pr_weight || set.pr_1rm || set.pr_reps || set.pr_time || set.pr_distance);
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
    const fields = TRACKING[trackingOf(entry)].fields;
    entry.sets.forEach((set, i) => {
      const last = prev.last_sets[i];
      if (!last || set.done) return;
      if (fields.every((f) => set[f] == null)) {
        for (const f of fields) set[f] = last[f] ?? null;
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
    activeWorkout = null;   // transient failures retry on the next load
  }
  if (activeWorkout) restoreWalIfAny();   // recover edits a failed save left behind
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
  setSaveState(workoutDirty ? "offline" : "saved");
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
// Swap the active-workout exercise at index i with its neighbour.
function moveWorkoutExercise(i, dir) {
  const arr = activeWorkout.content.exercises;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderWorkout();
  scheduleSave();
}

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
  const count = activeWorkout.content.exercises.length;
  const allDone = entry.sets.length > 0 && entry.sets.every((s) => s.done);
  // undefined -> follow allDone; true/false -> the user's explicit choice
  const collapsed = entry.done_collapsed ?? allDone;

  const block = document.createElement("div");
  block.className = "workout-exercise" + (collapsed ? " workout-exercise--collapsed" : "");

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

  const controls = document.createElement("div");
  controls.className = "workout-exercise-controls";
  const moves = [
    moveBtn(-1, exIndex === 0, () => moveWorkoutExercise(exIndex, -1)),
    moveBtn(1, exIndex === count - 1, () => moveWorkoutExercise(exIndex, 1)),
  ];
  controls.append(...moves, removeEx);

  head.append(name, controls);
  block.append(head);

  // Once every set is checked, fold the block to a one-liner so the next
  // exercise is on screen. Tap the head (not the controls) to reopen.
  if (collapsed) {
    const summary = document.createElement("span");
    summary.className = "workout-exercise-summary";
    summary.textContent = `✓ ${entry.sets.length} set${entry.sets.length === 1 ? "" : "s"}`;
    head.insertBefore(summary, controls);
    head.addEventListener("click", (e) => {
      if (e.target.closest(".workout-exercise-controls")) return;
      entry.done_collapsed = false;
      renderWorkout();
    });
    return block;
  }

  // All sets done: tapping the header row (name / blank space, not the ▲ ▼ Remove
  // controls) folds the block. Unfinished exercises don't collapse -- that would
  // hide sets you're still working.
  if (allDone) {
    head.classList.add("workout-exercise-head--tappable");
    head.addEventListener("click", (e) => {
      if (e.target.closest(".workout-exercise-controls")) return;
      entry.done_collapsed = true;
      renderWorkout();
    });
  }

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

  const mode = trackingOf(entry);
  const t = TRACKING[mode];
  const prev = previousByExercise[entry.exercise_id];

  const grid = document.createElement("div");
  grid.className = "sets-grid";
  grid.style.gridTemplateColumns = setsGridCols(mode);
  for (const label of ["SET", "PREV", ...t.heads, "✓", ""]) {
    const cell = document.createElement("div");
    cell.className = "sets-grid-head";
    cell.textContent = label;
    grid.append(cell);
  }

  entry.sets.forEach((set, setIndex) => {
    const num = document.createElement("div");
    num.className = "set-num";
    if (anyPr(set)) num.classList.add("set-num--pr");
    num.textContent = String(setIndex + 1);

    const prevCell = document.createElement("div");
    prevCell.className = "set-prev";
    prevCell.textContent = setSummary(
      prev && prev.last_sets && prev.last_sets[setIndex],
      mode,
    );

    const inputs = t.fields.map((f) => {
      const meta = FIELD_META[f];
      const inp = document.createElement("input");
      inp.className = "set-input" + (f === "seconds" ? " set-input--time" : "");
      inp.type = "text";
      inp.inputMode = meta.mode;
      if (f === "seconds") inp.placeholder = "m:ss";
      inp.value = meta.show(set[f]);
      inp.addEventListener("input", () => {
        set[f] = meta.parse(inp.value);
        updateWorkoutStats();
        scheduleSave();
      });
      return inp;
    });

    // A <label> so tapping anywhere in the (44px) cell toggles the checkbox.
    const doneWrap = document.createElement("label");
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
        set.pr_weight = set.pr_1rm = set.pr_reps = set.pr_time = set.pr_distance = false;
        entry.done_collapsed = false;   // reopened a set -> keep the block open
      }
      if (entry.sets.length > 0 && entry.sets.every((s) => s.done)
          && entry.done_collapsed == null) {
        entry.done_collapsed = true;    // last set checked -> auto-collapse
      }
      renderWorkout();                  // reflect collapse / PR badge / stats
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

    grid.append(num, prevCell, ...inputs, doneWrap, removeSet);
  });

  block.append(grid);

  const addSet = document.createElement("button");
  addSet.type = "button";
  addSet.className = "ghost workout-add-set";
  addSet.textContent = "+ Add Set";
  addSet.addEventListener("click", () => {
    entry.sets.push(emptySetFor(mode, { done: false }));
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
    const weightMode = trackingOf(entry) === "weight_reps";
    for (const set of entry.sets) {
      if (!set.done) continue;
      doneCount += 1;
      if (weightMode) volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    }
  }

  workoutVolumeEl.textContent =
    `${Number.isInteger(volume) ? volume : volume.toFixed(1)} lbs`;
  workoutSetsEl.textContent = String(doneCount);
}

// When a set is completed, see if it beats the user's best for this exercise in
// its tracking mode. First completed set of an exercise with no history just
// sets the baseline (no shout).
function checkForPr(entry, set, numEl) {
  const prev = entry.exercise_id ? previousByExercise[entry.exercise_id] : null;
  if (!prev) return;   // custom exercise with no id -> can't track
  const mode = trackingOf(entry);
  let hit = null;

  if (mode === "weight_reps") {
    const w = Number(set.weight) || 0;
    const r = Number(set.reps) || 0;
    if (w <= 0) return;
    const e1 = epley1rm(w, r);
    const wPr = prev.best_weight != null && w > prev.best_weight;
    const rPr = r > 0 && prev.best_1rm != null && e1 > prev.best_1rm;
    set.pr_weight = wPr;
    set.pr_1rm = rPr;
    if (prev.best_weight == null || w > prev.best_weight) prev.best_weight = w;
    if (r > 0 && (prev.best_1rm == null || e1 > prev.best_1rm)) prev.best_1rm = e1;
    const parts = [];
    if (wPr) parts.push(`Weight PR — ${w} lb`);
    if (rPr) parts.push(`1RM PR — ~${Math.round(e1)} lb`);
    hit = parts.join("    ") || null;
  } else if (mode === "reps") {
    const r = Number(set.reps) || 0;
    if (r <= 0) return;
    set.pr_reps = prev.best_reps != null && r > prev.best_reps;
    if (prev.best_reps == null || r > prev.best_reps) prev.best_reps = r;
    hit = set.pr_reps ? `Reps PR — ${r}` : null;
  } else if (mode === "time") {
    const s = Number(set.seconds) || 0;
    if (s <= 0) return;
    set.pr_time = prev.best_seconds != null && s > prev.best_seconds;
    if (prev.best_seconds == null || s > prev.best_seconds) prev.best_seconds = s;
    hit = set.pr_time ? `Time PR — ${fmtTime(s)}` : null;
  } else if (mode === "distance_time") {
    const d = Number(set.distance) || 0;
    if (d <= 0) return;
    set.pr_distance = prev.best_distance != null && d > prev.best_distance;
    if (prev.best_distance == null || d > prev.best_distance) prev.best_distance = d;
    hit = set.pr_distance ? `Distance PR — ${d.toFixed(1)} mi` : null;
  }

  if (hit) {
    numEl.classList.add("set-num--pr");
    showToast("🏆 " + hit);
  }
}

let toastTimer = null;
// showToast("message")
// showToast("message", { actionLabel: "Undo", onAction: fn })  -- adds a button
function showToast(msg, { actionLabel = null, onAction = null, duration = 2800 } = {}) {
  toastEl.replaceChildren();
  const span = document.createElement("span");
  span.textContent = msg;
  toastEl.append(span);

  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      clearTimeout(toastTimer);
      toastEl.hidden = true;
      onAction();
    });
    toastEl.append(btn);
    duration = Math.max(duration, 6000);
  }

  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, duration);
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
  openOverlay(restEditorEl);
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
restEditorCancelBtn.addEventListener("click", () => closeOverlay(restEditorEl));
restEditorEl.addEventListener("click", (e) => {
  if (e.target === restEditorEl) closeOverlay(restEditorEl);   // tap the backdrop
});
restEditorSaveBtn.addEventListener("click", async () => {
  closeOverlay(restEditorEl);
  if (!activeWorkout) return;
  activeWorkout.rest_seconds = restEditorValue;
  renderWorkout();   // refresh every "Rest Timer: ..." label
  try {
    const body = { content: activeWorkout.content, rest_seconds: restEditorValue };
    if (typeof activeWorkout.content_version === "number") {
      body.content_version = activeWorkout.content_version;
    }
    const res = await authFetch(WORKOUTS_API + "/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const saved = await res.json().catch(() => null);
      if (saved && activeWorkout) activeWorkout.content_version = saved.content_version;
      clearWal(activeWorkout && activeWorkout.id);
      setSaveState("saved");
    } else if (res.status === 409) {
      await handleSaveConflict(activeWorkout.id, res);
    }
  } catch (err) { /* the label already updated locally; a later save will sync */ }
});

// --- Saving --------------------------------------------------------------
// Every edit is mirrored to localStorage FIRST (a write-ahead log), then pushed
// to the server. A failed push keeps the WAL entry and retries with backoff, so
// closing the tab or losing the network between a failed save and the next edit
// no longer loses those sets. The WAL entry is cleared only once the server
// confirms the write.
let workoutDirty = false;          // unsaved edits exist (server hasn't confirmed)
let saveRetryTimer = null;
let saveRetryDelay = 2000;         // grows 2s -> 5s -> 15s -> 30s on repeated failure
let saveInFlight = false;
let conflictRetries = 0;

const WAL_PREFIX = "wal:workout:";
const walKey = (id) => WAL_PREFIX + id;

function writeWal() {
  try {
    if (!activeWorkout) return;
    localStorage.setItem(walKey(activeWorkout.id), JSON.stringify({
      content: activeWorkout.content,
      content_version: activeWorkout.content_version ?? null,
      ts: Date.now(),
    }));
  } catch (err) { /* private mode / quota -- nothing we can do */ }
}
function readWal(id) {
  try { return JSON.parse(localStorage.getItem(walKey(id)) || "null"); }
  catch (err) { return null; }
}
function clearWal(id) {
  try { localStorage.removeItem(walKey(id)); } catch (err) { /* ignore */ }
}

function setSaveState(state) {
  if (!workoutSaveStateEl) return;
  const text = {
    saved: "",
    saving: "Saving…",
    pending: "Unsaved changes",
    offline: "Unsaved — will retry",
  }[state] ?? "";
  workoutSaveStateEl.textContent = text;
  workoutSaveStateEl.dataset.state = state;
}

function scheduleSave() {
  workoutDirty = true;
  writeWal();                       // durable immediately, before the debounce
  setSaveState("pending");
  clearTimeout(workoutSaveTimer);
  workoutSaveTimer = setTimeout(() => saveWorkout(), 600);
}

async function saveWorkout({ keepalive = false } = {}) {
  clearTimeout(workoutSaveTimer);
  workoutSaveTimer = null;
  if (!activeWorkout || saveInFlight) return;
  ensureContent();
  writeWal();

  const id = activeWorkout.id;
  const body = { content: activeWorkout.content };
  if (typeof activeWorkout.content_version === "number") {
    body.content_version = activeWorkout.content_version;
  }

  saveInFlight = true;
  setSaveState("saving");
  let res;
  try {
    res = await authFetch(WORKOUTS_API + "/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
  } catch (err) {
    saveInFlight = false;
    scheduleSaveRetry();             // transient (offline / 5xx / server blip)
    return;
  }
  saveInFlight = false;

  if (res.status === 409) {
    await handleSaveConflict(id, res);
    return;
  }
  if (!res.ok) {
    scheduleSaveRetry();
    return;
  }

  // Success: adopt the new version, drop the WAL entry.
  try {
    const saved = await res.json();
    if (activeWorkout && activeWorkout.id === id && saved) {
      activeWorkout.content_version = saved.content_version;
    }
  } catch (err) { /* body not JSON -- fine, still saved */ }
  workoutDirty = false;
  conflictRetries = 0;
  saveRetryDelay = 2000;
  clearTimeout(saveRetryTimer);
  saveRetryTimer = null;
  clearWal(id);
  setSaveState("saved");
}

function scheduleSaveRetry() {
  workoutDirty = true;
  setSaveState("offline");
  clearTimeout(saveRetryTimer);
  saveRetryTimer = setTimeout(() => {
    saveRetryDelay = Math.min(30000, Math.round(saveRetryDelay * 2.5));
    if (activeWorkout && workoutDirty) saveWorkout();
  }, saveRetryDelay);
}

// 409 = another device saved this workout since we last loaded it.
async function handleSaveConflict(id, res) {
  let server = null;
  try {
    const data = await res.json();
    server = data && data.detail && data.detail.server;
  } catch (err) { /* ignore */ }
  if (!activeWorkout || activeWorkout.id !== id) { setSaveState("saved"); return; }

  const haveLocalEdits = workoutDirty || !!readWal(id);
  if (haveLocalEdits && conflictRetries < 3) {
    // Keep our edits (deliberate last-write-wins), but stash the server copy so
    // nothing is truly lost, adopt its version, and try once more.
    try {
      localStorage.setItem(
        "conflict:workout:" + id + ":" + Date.now(),
        JSON.stringify(server || {}),
      );
    } catch (err) { /* ignore */ }
    if (server && typeof server.content_version === "number") {
      activeWorkout.content_version = server.content_version;
    }
    conflictRetries += 1;
    console.warn("workout save conflict: kept local edits, stashed server copy");
    showToast("Changed on another device — your current edits were kept");
    await saveWorkout();
    return;
  }

  // No local edits (or we've retried enough): take the server's copy.
  if (server) {
    activeWorkout.content = server.content;
    activeWorkout.content_version = server.content_version;
    if (typeof server.rest_seconds === "number") {
      activeWorkout.rest_seconds = server.rest_seconds;
    }
    if (!workoutView.hidden) renderWorkout();
  }
  workoutDirty = false;
  conflictRetries = 0;
  clearWal(id);
  setSaveState("saved");
}

// On (re)attaching to an active workout from the server: if a WAL entry exists,
// the last save never confirmed -- restore the local copy and push it.
function restoreWalIfAny() {
  if (!activeWorkout) return;
  const id = activeWorkout.id;
  const wal = readWal(id);
  if (!wal || !wal.content) return;
  try {
    localStorage.setItem(
      "walserver:workout:" + id + ":" + Date.now(),
      JSON.stringify({ content: activeWorkout.content, content_version: activeWorkout.content_version }),
    );
  } catch (err) { /* ignore */ }
  activeWorkout.content = wal.content;
  workoutDirty = true;
  showToast("Restored unsaved changes from this device");
  scheduleSave();
}

function resetWorkoutSaveState(id) {
  workoutDirty = false;
  conflictRetries = 0;
  saveRetryDelay = 2000;
  saveInFlight = false;
  clearTimeout(saveRetryTimer);
  saveRetryTimer = null;
  clearTimeout(workoutSaveTimer);
  workoutSaveTimer = null;
  if (id) clearWal(id);
  setSaveState("saved");
}

function flushWorkoutSave() {
  if (workoutSaveTimer || workoutDirty) saveWorkout();
}

// Save right away if the page is being hidden/closed/backgrounded with an edit
// still pending. `pagehide` is the reliable one on iOS Safari.
function flushOnLeave() {
  if (activeWorkout && (workoutSaveTimer || workoutDirty)) {
    saveWorkout({ keepalive: true });
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushOnLeave();
});
window.addEventListener("pagehide", flushOnLeave);
window.addEventListener("online", () => {
  if (activeWorkout && workoutDirty) saveWorkout();
});

// --- Add exercise / finish / discard --------------------------------
workoutAddExerciseBtn.addEventListener("click", () => {
  openExercises({ onPick: addExercisesToWorkout, returnTo: workoutView });
});

function addExercisesToWorkout(list) {
  ensureContent();
  for (const ex of list) {
    const mode = TRACKING[ex.tracking_type] ? ex.tracking_type : "weight_reps";
    activeWorkout.content.exercises.push({
      exercise_id: ex.id,
      name: ex.name,
      tracking_type: mode,
      notes: "",
      sets: [emptySetFor(mode, { done: false })],
    });
  }
  scheduleSave();
  closeExercises();          // back to the workout view
  renderWorkout();
  loadPreviousForWorkout();  // pull previous / PR data for the new exercises
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

// True when the workout's exercise makeup differs from the routine's template:
// exercises added / removed / reordered, or a changed set count / tracking mode.
// The weights & reps logged this session don't count -- only structure.
function routineStructureChanged(wEx, rEx) {
  if (wEx.length !== rEx.length) return true;
  for (let i = 0; i < wEx.length; i++) {
    const a = wEx[i];
    const b = rEx[i];
    if ((a.exercise_id ?? a.name) !== (b.exercise_id ?? b.name)) return true;
    if (trackingOf(a) !== trackingOf(b)) return true;
    if ((a.sets || []).length !== (b.sets || []).length) return true;
  }
  return false;
}

// If this workout came from a routine AND its exercise list changed, offer to
// fold those changes back into the routine for future workouts.
async function maybeSyncRoutineFromWorkout() {
  const routineId = activeWorkout && activeWorkout.routine_id;
  if (!routineId) return;

  const routine = routines.find((r) => r.id === routineId);
  if (!routine) return;   // routine was deleted meanwhile

  const wEx = activeWorkout.content.exercises || [];
  const rEx = (routine.content && routine.content.exercises) || [];
  if (!routineStructureChanged(wEx, rEx)) return;

  const ok = await appConfirm({
    title: "Update routine?",
    body: `You changed the exercises in this workout. Update "${routine.name}" for future workouts?`,
    confirmLabel: "Update routine",
    cancelLabel: "Keep original",
  });
  if (!ok) return;

  const content = {
    exercises: activeWorkout.content.exercises.map((entry) => {
      const fields = TRACKING[trackingOf(entry)].fields;
      return {
        exercise_id: entry.exercise_id ?? null,
        name: entry.name,
        tracking_type: trackingOf(entry),
        sets: entry.sets.map((s) => {
          const out = {};
          for (const f of fields) out[f] = s[f] ?? null;
          return out;
        }),
      };
    }),
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
  if (!(await appConfirm({
    title: "Discard workout?",
    body: "This can't be undone.",
    confirmLabel: "Discard",
    danger: true,
  }))) return;
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
  const endedId = activeWorkout && activeWorkout.id;
  activeWorkout = null;
  resetWorkoutSaveState(endedId);   // clears the WAL + any pending retry
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
  const name = (await appConfirm({
    title: "New folder",
    confirmLabel: "Create",
    prompt: { placeholder: "Folder name" },
  })) || "";
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
  const name = (await appConfirm({
    title: "Rename folder",
    confirmLabel: "Rename",
    prompt: { value: folder.name },
  })) || "";
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
  if (!(await appConfirm({
    title: `Delete "${folder.name}"?`,
    body: "Its routines move to My Routines.",
    confirmLabel: "Delete",
    danger: true,
  }))) return;
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
    if (!(await appConfirm({
      title: "Workout in progress",
      body: "Open the one you already have going?",
      confirmLabel: "Open workout",
    }))) return;
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

// Swap the exercise at index i with its neighbour in the given direction.
function moveRoutineExercise(i, dir) {
  const arr = editingRoutine.content.exercises;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderRoutineEditor();
}

// Like buildExerciseBlock, but a template row: SET | LBS | REPS | remove,
// no done checkbox, no notes, no stats. The head carries ▲ ▼ reorder controls.
function buildRoutineExerciseBlock(entry, exIndex) {
  const count = editingRoutine.content.exercises.length;
  const block = document.createElement("div");
  block.className = "workout-exercise";

  const head = document.createElement("div");
  head.className = "workout-exercise-head";

  const name = document.createElement("span");
  name.className = "workout-exercise-name";
  name.textContent = entry.name;

  const controls = document.createElement("div");
  controls.className = "workout-exercise-controls";
  controls.append(
    moveBtn(-1, exIndex === 0, () => moveRoutineExercise(exIndex, -1)),
    moveBtn(1, exIndex === count - 1, () => moveRoutineExercise(exIndex, 1)),
  );

  const removeEx = document.createElement("button");
  removeEx.type = "button";
  removeEx.className = "link-danger";
  removeEx.textContent = "Remove";
  removeEx.addEventListener("click", () => {
    editingRoutine.content.exercises.splice(exIndex, 1);
    renderRoutineEditor();
  });
  controls.append(removeEx);

  head.append(name, controls);
  block.append(head);

  const mode = trackingOf(entry);
  const t = TRACKING[mode];

  const grid = document.createElement("div");
  grid.className = "sets-grid sets-grid--template";
  grid.style.gridTemplateColumns = setsGridCols(mode, {
    withPrev: false,
    withDone: false,
  });
  for (const label of ["SET", ...t.heads, ""]) {
    const cell = document.createElement("div");
    cell.className = "sets-grid-head";
    cell.textContent = label;
    grid.append(cell);
  }

  entry.sets.forEach((set, setIndex) => {
    const num = document.createElement("div");
    num.className = "set-num";
    num.textContent = String(setIndex + 1);

    const inputs = t.fields.map((f) => {
      const meta = FIELD_META[f];
      const inp = document.createElement("input");
      inp.className = "set-input" + (f === "seconds" ? " set-input--time" : "");
      inp.type = "text";
      inp.inputMode = meta.mode;
      if (f === "seconds") inp.placeholder = "m:ss";
      inp.value = meta.show(set[f]);
      inp.addEventListener("input", () => { set[f] = meta.parse(inp.value); });
      return inp;
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

    grid.append(num, ...inputs, removeSet);
  });

  block.append(grid);

  const addSet = document.createElement("button");
  addSet.type = "button";
  addSet.className = "ghost workout-add-set";
  addSet.textContent = "+ Add Set";
  addSet.addEventListener("click", () => {
    entry.sets.push(emptySetFor(mode));
    renderRoutineEditor();
  });
  block.append(addSet);

  return block;
}

routineAddExerciseBtn.addEventListener("click", () => {
  openExercises({ onPick: addExercisesToRoutine, returnTo: routineView });
});

function addExercisesToRoutine(list) {
  for (const ex of list) {
    const mode = TRACKING[ex.tracking_type] ? ex.tracking_type : "weight_reps";
    editingRoutine.content.exercises.push({
      exercise_id: ex.id,
      name: ex.name,
      tracking_type: mode,
      sets: [emptySetFor(mode)],
    });
  }
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
  if (!(await appConfirm({
    title: `Delete "${editingRoutine.name}"?`,
    confirmLabel: "Delete",
    danger: true,
  }))) return;
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

routineBackBtn.addEventListener("click", async () => {
  if (!editingRoutine) {
    closeRoutineEditor();
    return;
  }
  editingRoutine.name = routineNameInput.value;
  const dirty = JSON.stringify(editingRoutine) !== originalRoutineJSON;
  if (dirty && !(await appConfirm({
    title: "Discard changes?",
    confirmLabel: "Discard",
    danger: true,
  }))) return;
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
    if (!(await appConfirm({
      title: "Workout in progress",
      body: "Open the one you already have going?",
      confirmLabel: "Open workout",
    }))) return;
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
  // Remember the origin (Calendar, the full History list, or the home preview).
  historyDetailFrom = !calendarView.hidden ? calendarView
    : historyView.hidden ? home : historyView;
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
  if (!(await appConfirm({
    title: "Delete workout?",
    body: "It's removed from your history everywhere.",
    confirmLabel: "Delete",
    danger: true,
  }))) return;
  const deletedId = historyDetailId;
  const cameFrom = historyDetailFrom;
  historyDetailDeleteBtn.disabled = true;
  try {
    const res = await authFetch(`${WORKOUTS_API}/${deletedId}`, { method: "DELETE" });
    if (res.status !== 204 && res.status !== 404) return;
    exerciseStatsCache.clear();   // any exercise's stats may have changed
    showView(cameFrom);
    loadHistory();
    loadHomeHistory();
    if (cameFrom === calendarView) loadCalendar();
    showToast("Workout deleted", {
      actionLabel: "Undo",
      onAction: async () => {
        try {
          await authFetch(`${WORKOUTS_API}/${deletedId}/restore`, { method: "POST" });
        } catch (err) { /* ignore */ }
        exerciseStatsCache.clear();
        loadHistory();
        loadHomeHistory();
        if (cameFrom === calendarView) loadCalendar();
      },
    });
  } catch (err) {
    /* stay put */
  } finally {
    historyDetailDeleteBtn.disabled = false;
  }
});

// --- Calendar -------------------------------------------------------------
// A continuous vertical run of month grids, from the first workout's month
// through next month, auto-centred on the current month. Days with a finished
// workout are highlighted and carry a chip per workout that opens its summary.
const CAL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CAL_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Local Y-M-D key, so workouts bucket by the day the user sees (not UTC).
const calDayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

menuCalendarBtn.addEventListener("click", () => { closeSideMenu(); openCalendar(); });
calendarBackBtn.addEventListener("click", () => showView(home));

async function openCalendar() {
  showView(calendarView);
  await loadCalendar();
}

async function loadCalendar() {
  calendarStatusEl.textContent = "Loading…";
  calendarScrollEl.replaceChildren();
  try {
    const res = await authFetch(WORKOUTS_API + "/calendar");
    if (!res.ok) {
      calendarStatusEl.textContent = "Could not load your calendar.";
      return;
    }
    renderCalendar(await res.json());   // [{id, at, name}] ascending by date
  } catch (err) {
    calendarStatusEl.textContent = err.message || "Could not reach the server.";
  }
}

function renderCalendar(items) {
  calendarStatusEl.textContent = items.length ? "" : "No workouts logged yet.";

  // Bucket workouts by local day.
  const byDay = new Map();
  for (const w of items) {
    const key = calDayKey(new Date(w.at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ id: w.id, name: w.name || "Workout", at: w.at });
  }

  const now = new Date();
  const firstAt = items.length ? new Date(items[0].at) : now;
  let y = firstAt.getFullYear();
  let m = firstAt.getMonth();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;          // one trailing month for headroom
  const todayKey = calDayKey(now);
  let currentMonthEl = null;

  while (y < endY || (y === endY && m <= endM)) {
    const monthEl = buildCalendarMonth(y, m, byDay, todayKey);
    if (y === now.getFullYear() && m === now.getMonth()) currentMonthEl = monthEl;
    calendarScrollEl.append(monthEl);
    m++;
    if (m > 11) { m = 0; y++; }
  }

  if (currentMonthEl) {
    requestAnimationFrame(() => currentMonthEl.scrollIntoView({ block: "center" }));
  }
}

function buildCalendarMonth(year, month, byDay, todayKey) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-month";

  const label = document.createElement("div");
  label.className = "calendar-month-label";
  label.textContent = `${CAL_MONTHS[month]} ${year}`;
  wrap.append(label);

  const head = document.createElement("div");
  head.className = "calendar-weekdays";
  for (const d of CAL_WEEKDAYS) {
    const c = document.createElement("span");
    c.className = "calendar-weekday";
    c.textContent = d;
    head.append(c);
  }
  wrap.append(head);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDow; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day calendar-day--empty";
    grid.append(blank);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`;
    const workouts = byDay.get(key);

    // A day with workouts is itself the button; a plain day is a static div.
    const cell = document.createElement(workouts ? "button" : "div");
    cell.className = "calendar-day";
    if (workouts) cell.type = "button";
    if (key === todayKey) cell.classList.add("calendar-day--today");

    const num = document.createElement("div");
    num.className = "calendar-day-num";
    num.textContent = day;
    cell.append(num);

    if (workouts) {
      cell.classList.add("calendar-day--has-workout");

      const label = document.createElement("div");
      label.className = "calendar-day-label";
      label.textContent = workouts.length === 1
        ? workouts[0].name
        : `${workouts[0].name} +${workouts.length - 1}`;
      cell.title = workouts.map((w) => w.name).join(", ");
      cell.append(label);

      // One workout jumps straight to it; several open a chooser.
      cell.addEventListener("click", () => {
        if (workouts.length === 1) openHistoryDetail(workouts[0].id);
        else openDayPicker(workouts);
      });
    }
    grid.append(cell);
  }
  wrap.append(grid);
  return wrap;
}

// Chooser shown when a tapped calendar day holds more than one workout.
function openDayPicker(workouts) {
  dayPickerTitleEl.textContent = new Date(workouts[0].at).toLocaleDateString(
    undefined, { weekday: "long", month: "long", day: "numeric" },
  );
  dayPickerListEl.replaceChildren();
  for (const w of workouts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "day-picker-item";
    const name = document.createElement("span");
    name.textContent = w.name;
    const time = document.createElement("span");
    time.className = "day-picker-time";
    time.textContent = "  ·  " + new Date(w.at).toLocaleTimeString(
      undefined, { hour: "numeric", minute: "2-digit" },
    );
    item.append(name, time);
    item.addEventListener("click", () => { closeDayPicker(); openHistoryDetail(w.id); });
    dayPickerListEl.append(item);
  }
  openOverlay(dayPickerEl);
}

function closeDayPicker() {
  closeOverlay(dayPickerEl);
}

dayPickerCancelBtn.addEventListener("click", closeDayPicker);
dayPickerEl.addEventListener("click", (e) => {   // tap the dimmed area to close
  if (e.target === dayPickerEl) closeDayPicker();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dayPickerEl.hidden) closeDayPicker();
});

// --- Measurements --------------------------------------------------------
// A line graph of one chosen body measurement, a horizontally-scrollable chip
// row to switch which one, and a history list. Entries are logged / edited in a
// modal that also takes an optional (client-downscaled) progress photo. Values
// are stored canonically (kg / cm / %) and converted to the user's units here.
const MEASUREMENTS_API = "/api/measurements";
const MEASUREMENT_TYPES = [
  { key: "bodyweight",  label: "Bodyweight",  dim: "mass" },
  { key: "body_fat",    label: "Body fat",    dim: "percent" },
  { key: "neck",        label: "Neck",        dim: "length" },
  { key: "shoulders",   label: "Shoulders",   dim: "length" },
  { key: "chest",       label: "Chest",       dim: "length" },
  { key: "left_bicep",  label: "Left bicep",  dim: "length" },
  { key: "right_bicep", label: "Right bicep", dim: "length" },
  { key: "waist",       label: "Waist",       dim: "length" },
  { key: "hips",        label: "Hips",        dim: "length" },
  { key: "left_thigh",  label: "Left thigh",  dim: "length" },
  { key: "right_thigh", label: "Right thigh", dim: "length" },
  { key: "left_calf",   label: "Left calf",   dim: "length" },
  { key: "right_calf",  label: "Right calf",  dim: "length" },
];
const MEASUREMENT_TYPE_BY_KEY = Object.fromEntries(
  MEASUREMENT_TYPES.map((t) => [t.key, t]),
);

const measurementUnits = () =>
  currentUser?.preferences?.measurement_units === "metric" ? "metric" : "imperial";

function unitLabel(dim) {
  const metric = measurementUnits() === "metric";
  if (dim === "mass") return metric ? "kg" : "lb";
  if (dim === "length") return metric ? "cm" : "in";
  return "%";
}
// canonical -> display
function toDisplay(dim, v) {
  if (v == null) return null;
  if (measurementUnits() === "metric" || dim === "percent") return v;
  return dim === "mass" ? v * 2.2046226 : v / 2.54;
}
// display -> canonical
function toCanonical(dim, v) {
  if (v == null || !Number.isFinite(v)) return null;
  if (measurementUnits() === "metric" || dim === "percent") return v;
  return dim === "mass" ? v / 2.2046226 : v * 2.54;
}
const fmtMeasureNum = (n) => String(Math.round(n * 10) / 10);
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtYmd = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });

const MEASUREMENT_MAX_PHOTOS = 4;

let measurementEntries = [];
let measurementGraphType = "bodyweight";
let measurementPhotos = [];        // base64 data URLs, up to MEASUREMENT_MAX_PHOTOS
let measurementEditId = null;      // id when editing an entry, null when adding
let measurementEditMode = true;    // false = viewing an existing entry read-only

menuMeasurementsBtn.addEventListener("click", () => { closeSideMenu(); openMeasurements(); });
measurementsBackBtn.addEventListener("click", () => showView(home));
measurementsAddBtn.addEventListener("click", () => openMeasurementEditor(null));

async function openMeasurements() {
  showView(measurementsView);
  await loadMeasurements();
}

function measurementCount(typeKey) {
  return measurementEntries.filter((e) => e.values && e.values[typeKey] != null).length;
}

async function loadMeasurements() {
  measurementsStatusEl.textContent = "Loading…";
  measurementsChartEl.replaceChildren();
  measurementsFilterEl.replaceChildren();
  measurementsListEl.replaceChildren();
  try {
    const res = await authFetch(MEASUREMENTS_API);
    if (!res.ok) {
      measurementsStatusEl.textContent = "Could not load your measurements.";
      return;
    }
    measurementEntries = await res.json();   // newest-first
    if (measurementCount(measurementGraphType) === 0) {
      const withData = MEASUREMENT_TYPES.find((t) => measurementCount(t.key) > 0);
      if (withData) measurementGraphType = withData.key;
    }
    renderMeasurements();
  } catch (err) {
    measurementsStatusEl.textContent = err.message || "Could not reach the server.";
  }
}

function measurementSeries(typeKey) {
  const t = MEASUREMENT_TYPE_BY_KEY[typeKey];
  return measurementEntries
    .filter((e) => e.values && e.values[typeKey] != null)
    .map((e) => ({
      date: e.measured_on + "T12:00:00",
      value: toDisplay(t.dim, e.values[typeKey]),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function measurementPlaceholder(text) {
  const p = document.createElement("p");
  p.className = "measurement-empty";
  p.textContent = text;
  return p;
}

function renderMeasurements() {
  if (measurementEntries.length === 0) {
    measurementsStatusEl.textContent = "No measurements yet — tap Add to log your first.";
    return;
  }
  measurementsStatusEl.textContent = "";

  // Graph
  const type = MEASUREMENT_TYPE_BY_KEY[measurementGraphType];
  const series = measurementSeries(measurementGraphType);
  const chart = buildExerciseChart(series, "value", fmtMeasureNum);
  measurementsChartEl.replaceChildren(
    chart ||
      measurementPlaceholder(`Log at least 2 ${type.label.toLowerCase()} entries to see a graph.`),
  );

  // Filter chips
  measurementsFilterEl.replaceChildren();
  let activeChip = null;
  for (const t of MEASUREMENT_TYPES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "measurement-chip";
    chip.textContent = t.label;
    if (t.key === measurementGraphType) {
      chip.classList.add("measurement-chip--active");
      activeChip = chip;
    }
    chip.addEventListener("click", () => {
      measurementGraphType = t.key;
      renderMeasurements();
    });
    measurementsFilterEl.append(chip);
  }
  if (activeChip) activeChip.scrollIntoView({ inline: "center", block: "nearest" });

  // History list
  measurementsListEl.replaceChildren(
    ...measurementEntries.map(buildMeasurementRow),
  );
}

function buildMeasurementRow(entry) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "measurement-row";

  const date = document.createElement("span");
  date.className = "measurement-row-date";
  date.textContent = fmtYmd(entry.measured_on);
  row.append(date);

  const parts = [];
  for (const t of MEASUREMENT_TYPES) {
    const v = entry.values && entry.values[t.key];
    if (v == null) continue;
    parts.push(`${t.label} ${fmtMeasureNum(toDisplay(t.dim, v))} ${unitLabel(t.dim)}`);
  }
  const meta = document.createElement("span");
  meta.className = "measurement-row-meta";
  if (parts.length === 0) {
    meta.textContent = "No values";
  } else {
    meta.textContent = parts.slice(0, 3).join("  ·  ") +
      (parts.length > 3 ? `  ·  +${parts.length - 3} more` : "");
  }
  row.append(meta);

  if (entry.photo_count > 0) {
    const cam = document.createElement("span");
    cam.className = "measurement-row-cam";
    cam.textContent = `📷 ${entry.photo_count}`;
    row.append(cam);
  }

  row.addEventListener("click", () => openMeasurementEditor(entry.id));
  return row;
}

// --- Add / edit screen ---
function buildMeasurementFieldRows(values) {
  measurementFieldsEl.replaceChildren();
  for (const t of MEASUREMENT_TYPES) {
    const rowEl = document.createElement("div");
    rowEl.className = "measurement-field-row";

    const label = document.createElement("label");
    label.textContent = `${t.label} (${unitLabel(t.dim)})`;
    label.htmlFor = `mfield-${t.key}`;

    const input = document.createElement("input");
    input.id = `mfield-${t.key}`;
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "0.1";
    input.className = "measurement-input";
    input.dataset.key = t.key;
    input.dataset.dim = t.dim;
    input.disabled = !measurementEditMode;
    const v = values && values[t.key];
    input.value = v != null ? fmtMeasureNum(toDisplay(t.dim, v)) : "";

    rowEl.append(label, input);
    measurementFieldsEl.append(rowEl);
  }
}

// Render the photo thumbnails; show remove buttons + the file picker only while editing.
function renderMeasurementPhotos() {
  measurementPhotosEl.replaceChildren();
  measurementPhotos.forEach((src, i) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "measurement-photo-thumb";

    const img = document.createElement("img");
    img.src = src;
    img.alt = `Progress photo ${i + 1}`;
    thumb.append(img);
    thumb.addEventListener("click", () => openPhotoViewer(src));

    if (measurementEditMode) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "measurement-photo-remove";
      rm.textContent = "✕";
      rm.setAttribute("aria-label", "Remove photo");
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        measurementPhotos.splice(i, 1);
        renderMeasurementPhotos();
      });
      thumb.append(rm);
    }
    measurementPhotosEl.append(thumb);
  });
  measurementPhotoInput.hidden =
    !measurementEditMode || measurementPhotos.length >= MEASUREMENT_MAX_PHOTOS;
}

// Flip the whole screen between read-only and editable.
function applyMeasurementEditMode(on) {
  measurementEditMode = on;
  measurementDateInput.disabled = !on;
  for (const i of measurementFieldsEl.querySelectorAll(".measurement-input")) {
    i.disabled = !on;
  }
  measurementSaveBtn.hidden = !on;
  measurementDeleteBtn.hidden = !on || !measurementEditId;
  measurementEditBtn.hidden = on || !measurementEditId;
  measurementEditorTitleEl.textContent = !measurementEditId
    ? "Add measurements"
    : on ? "Edit measurements" : "Measurements";
  renderMeasurementPhotos();
}

async function openMeasurementEditor(id) {
  measurementEditId = id || null;
  measurementPhotos = [];
  measurementPhotoInput.value = "";
  measurementMsgEl.textContent = "";
  measurementMsgEl.dataset.kind = "error";

  if (measurementEditId) {
    // Open an existing entry read-only; the Edit button unlocks it.
    measurementEditMode = false;
    buildMeasurementFieldRows(null);
    applyMeasurementEditMode(false);
    showView(measurementEditorView);
    try {
      const res = await authFetch(MEASUREMENTS_API + "/" + measurementEditId);
      if (!res.ok) {
        measurementMsgEl.textContent = "Could not load that entry.";
        return;
      }
      const entry = await res.json();
      measurementDateInput.value = entry.measured_on;
      buildMeasurementFieldRows(entry.values || {});
      measurementPhotos = Array.isArray(entry.photos) ? entry.photos.slice() : [];
      applyMeasurementEditMode(false);
    } catch (err) {
      measurementMsgEl.textContent = err.message || "Could not reach the server.";
    }
  } else {
    // A brand-new entry is editable straight away.
    measurementEditMode = true;
    measurementDateInput.value = todayYmd();
    buildMeasurementFieldRows(null);
    applyMeasurementEditMode(true);
    showView(measurementEditorView);
  }
}

function closeMeasurementEditor() {
  showView(measurementsView);
}

// --- Full-size photo viewer ---
function openPhotoViewer(src) {
  measurementPhotoViewerImg.src = src;
  openOverlay(measurementPhotoViewerEl);
}
function closePhotoViewer() {
  closeOverlay(measurementPhotoViewerEl);   // src is replaced on the next open
}
measurementPhotoViewerEl.addEventListener("click", closePhotoViewer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !measurementPhotoViewerEl.hidden) closePhotoViewer();
});

// Shrink an image to fit within maxDim and re-encode as JPEG, returning a data URL.
function downscaleImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

measurementPhotoInput.addEventListener("change", async () => {
  const files = [...(measurementPhotoInput.files || [])];
  measurementPhotoInput.value = "";
  if (files.length === 0) return;

  const room = MEASUREMENT_MAX_PHOTOS - measurementPhotos.length;
  if (room <= 0) {
    measurementMsgEl.textContent = `Up to ${MEASUREMENT_MAX_PHOTOS} photos per entry.`;
    return;
  }
  measurementMsgEl.textContent = "";
  for (const file of files.slice(0, room)) {
    try {
      measurementPhotos.push(await downscaleImage(file, 1024, 0.7));
    } catch (err) {
      measurementMsgEl.textContent = err.message || "Could not read that image.";
    }
  }
  if (files.length > room) {
    measurementMsgEl.textContent = `Only ${MEASUREMENT_MAX_PHOTOS} photos per entry — extras were skipped.`;
  }
  renderMeasurementPhotos();
});

measurementEditBtn.addEventListener("click", () => applyMeasurementEditMode(true));

measurementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  measurementMsgEl.textContent = "";
  measurementMsgEl.dataset.kind = "error";

  if (!measurementDateInput.value) {
    measurementMsgEl.textContent = "Pick a date.";
    return;
  }

  const values = {};
  for (const input of measurementFieldsEl.querySelectorAll(".measurement-input")) {
    const raw = input.value.trim();
    if (raw === "") continue;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) continue;
    values[input.dataset.key] = toCanonical(input.dataset.dim, n);
  }

  if (Object.keys(values).length === 0 && measurementPhotos.length === 0) {
    measurementMsgEl.textContent = "Enter at least one measurement or a photo.";
    return;
  }

  const payload = {
    measured_on: measurementDateInput.value,
    values,
    photos: measurementPhotos,
  };

  measurementSaveBtn.disabled = true;
  try {
    const res = await authFetch(
      MEASUREMENTS_API + (measurementEditId ? "/" + measurementEditId : ""),
      {
        method: measurementEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      measurementMsgEl.textContent = detailToText(data.detail) || "Could not save.";
      return;
    }
    closeMeasurementEditor();
    await loadMeasurements();
  } catch (err) {
    measurementMsgEl.textContent = err.message || "Could not reach the server.";
  } finally {
    measurementSaveBtn.disabled = false;
  }
});

measurementDeleteBtn.addEventListener("click", async () => {
  if (!measurementEditId) return;
  if (!(await appConfirm({
    title: "Delete entry?",
    confirmLabel: "Delete",
    danger: true,
  }))) return;
  const deletedId = measurementEditId;
  measurementDeleteBtn.disabled = true;
  try {
    const res = await authFetch(MEASUREMENTS_API + "/" + deletedId, { method: "DELETE" });
    if (res.status !== 204 && res.status !== 404) return;
    closeMeasurementEditor();
    await loadMeasurements();
    showToast("Measurement deleted", {
      actionLabel: "Undo",
      onAction: async () => {
        try {
          await authFetch(MEASUREMENTS_API + "/" + deletedId + "/restore", { method: "POST" });
        } catch (err) { /* ignore */ }
        await loadMeasurements();
      },
    });
  } catch (err) {
    /* stay put */
  } finally {
    measurementDeleteBtn.disabled = false;
  }
});

measurementEditorBackBtn.addEventListener("click", closeMeasurementEditor);

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

    const mode = trackingOf(entry);
    const t = TRACKING[mode];
    const grid = document.createElement("div");
    grid.className = "sets-grid sets-grid--readonly";
    grid.style.gridTemplateColumns = setsGridCols(mode, {
      withPrev: false,
      withDone: false,
    }).replace(/1\.2rem$/, "2.5rem");   // the last col is the ✓/🏆 mark
    for (const label of ["SET", ...t.heads, ""]) {
      const cell = document.createElement("div");
      cell.className = "sets-grid-head";
      cell.textContent = label;
      grid.append(cell);
    }

    (entry.sets || []).forEach((set, i) => {
      const num = document.createElement("div");
      num.className = "set-num";
      num.textContent = String(i + 1);

      const cells = t.fields.map((f) => {
        const c = document.createElement("div");
        c.className = "set-readonly";
        c.textContent = FIELD_META[f].show(set[f]) || "–";
        return c;
      });

      const mark = document.createElement("div");
      mark.className = "set-readonly";
      const bits = [];
      if (set.done) bits.push("✓");
      if (anyPr(set)) bits.push("🏆");
      mark.textContent = bits.join(" ");

      grid.append(num, ...cells, mark);
    });

    block.append(grid);
    container.append(block);
  }
}

// --- Side menu ---------------------------------------------------------------
function openSideMenu() {
  openOverlay(sideMenu);
  menuBtn.setAttribute("aria-expanded", "true");
}
function closeSideMenu() {
  closeOverlay(sideMenu);
  menuBtn.setAttribute("aria-expanded", "false");
}
menuBtn.addEventListener("click", openSideMenu);
menuCloseBtn.addEventListener("click", closeSideMenu);   // "Back" at the top of the panel
sideMenu.addEventListener("click", (e) => {          // tap the dimmed area to close
  if (e.target === sideMenu) closeSideMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !sideMenu.hidden) closeSideMenu();
});
menuSettingsBtn.addEventListener("click", () => { closeSideMenu(); openSettings(); });
menuTrashBtn.addEventListener("click", () => { closeSideMenu(); openTrash(); });
trashBackBtn.addEventListener("click", () => showView(home));

// --- Settings ------------------------------------------------------------
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
  setUnitsSelect.value = currentUser?.preferences?.measurement_units === "metric" ? "metric" : "imperial";
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
    preferences: {
      default_rest_seconds: rest,
      measurement_units: setUnitsSelect.value === "metric" ? "metric" : "imperial",
    },
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
  if (!(await appConfirm({
    title: "Delete account?",
    body: "This cannot be undone.",
    confirmLabel: "Delete",
    danger: true,
  }))) return;
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

// --- Trash -------------------------------------------------------------------
// Soft-deleted workouts + measurements, restorable until the 30-day purge.
async function openTrash() {
  showView(trashView);
  await loadTrash();
}

async function loadTrash() {
  trashStatusEl.textContent = "Loading…";
  trashListEl.replaceChildren();
  let workouts = [];
  let measurements = [];
  try {
    const [wRes, mRes] = await Promise.all([
      authFetch(WORKOUTS_API + "/trash"),
      authFetch(MEASUREMENTS_API + "/trash"),
    ]);
    workouts = wRes.ok ? await wRes.json() : [];
    measurements = mRes.ok ? await mRes.json() : [];
  } catch (err) {
    trashStatusEl.textContent = err.message || "Could not reach the server.";
    return;
  }

  if (workouts.length === 0 && measurements.length === 0) {
    trashStatusEl.textContent = "Trash is empty.";
    return;
  }
  trashStatusEl.textContent = "";

  for (const w of workouts) {
    trashListEl.append(buildTrashRow(
      `${w.name}`,
      `${fmtDate(w.at)}  ·  ${w.exercise_count} exercise${w.exercise_count === 1 ? "" : "s"}  ·  deleted ${fmtDate(w.deleted_at)}`,
      async () => {
        const res = await authFetch(`${WORKOUTS_API}/${w.id}/restore`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(detailToText(data.detail) || "Could not restore.");
          return;
        }
        exerciseStatsCache.clear();
        loadHomeHistory();
        loadTrash();
      },
    ));
  }

  for (const m of measurements) {
    trashListEl.append(buildTrashRow(
      `Measurements — ${fmtYmd(m.measured_on)}`,
      `${m.value_count} value${m.value_count === 1 ? "" : "s"}` +
        (m.photo_count ? `  ·  ${m.photo_count} photo${m.photo_count === 1 ? "" : "s"}` : "") +
        `  ·  deleted ${fmtDate(m.deleted_at)}`,
      async () => {
        const res = await authFetch(`${MEASUREMENTS_API}/${m.id}/restore`, { method: "POST" });
        if (res.ok) loadTrash();
      },
    ));
  }
}

function buildTrashRow(title, meta, onRestore) {
  const row = document.createElement("div");
  row.className = "history-row";

  const main = document.createElement("div");
  main.className = "history-row-main";
  const t = document.createElement("span");
  t.className = "history-row-title";
  t.textContent = title;
  const m = document.createElement("span");
  m.className = "history-row-meta";
  m.textContent = meta;
  main.append(t, m);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost";
  btn.textContent = "Restore";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await onRestore(); } finally { btn.disabled = false; }
  });

  row.append(main, btn);
  return row;
}

// --- Full JSON backup: export / import (Settings) ---------------------------
settingsExportJsonBtn.addEventListener("click", async () => {
  settingsExportJsonBtn.disabled = true;
  setMsg(settingsDataMsg, "");
  try {
    const res = await authFetch("/api/data/export");
    if (!res.ok) { setMsg(settingsDataMsg, "Could not export."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workout-backup-${todayYmd()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg(settingsDataMsg, "Backup downloaded.", "ok");
  } catch (err) {
    setMsg(settingsDataMsg, err.message || "Could not reach the server.");
  } finally {
    settingsExportJsonBtn.disabled = false;
  }
});

settingsImportBtn.addEventListener("click", () => settingsImportFile.click());

settingsImportFile.addEventListener("change", async () => {
  const file = settingsImportFile.files && settingsImportFile.files[0];
  settingsImportFile.value = "";
  if (!file) return;
  setMsg(settingsDataMsg, "Importing…", "ok");

  let doc;
  try {
    doc = JSON.parse(await file.text());
  } catch (err) {
    setMsg(settingsDataMsg, "That file isn't valid JSON.");
    return;
  }

  try {
    const res = await authFetch("/api/data/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(settingsDataMsg, detailToText(data.detail) || "Import failed.");
      return;
    }
    const ins = data.inserted || {};
    const total = Object.values(ins).reduce((a, b) => a + b, 0);
    setMsg(
      settingsDataMsg,
      `Imported ${total} row${total === 1 ? "" : "s"} ` +
        `(${ins.workouts || 0} workouts, ${ins.routines || 0} routines, ` +
        `${ins.measurements || 0} measurements). Existing rows were left as-is.`,
      "ok",
    );
    loadRoutines();
    loadHomeHistory();
  } catch (err) {
    setMsg(settingsDataMsg, err.message || "Could not reach the server.");
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
