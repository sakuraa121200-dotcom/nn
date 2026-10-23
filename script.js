/* Blossom — API-backed storage.
   Keeps the existing page's DOM IDs and task rendering.
   Set API_BASE to the deployed Flask API URL before publishing. */
const API_BASE = "https://YOUR-FLASK-SERVICE.example.com";
const STORAGE_KEY = "blossom-tasks";
const OWNER_KEY = "blossom-owner-id";
const MIGRATED_KEY = "blossom-mysql-migrated-v1";

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

let ownerId = localStorage.getItem(OWNER_KEY);
if (!ownerId) {
  ownerId = uuid();
  localStorage.setItem(OWNER_KEY, ownerId);
}

function readLocalTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTasks(input) {
  return input.map(task => ({
    localId: task.localId || uuid(),
    text: String(task.text || "").slice(0, 120),
    done: Boolean(task.done)
  })).filter(task => task.text.trim());
}

function saveLocalTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

async function api(path, options = {}) {
  if (API_BASE.includes("YOUR-FLASK-SERVICE")) {
    throw new Error("Set API_BASE in script.js to your deployed Flask URL.");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
  return data;
}

function ownerQuery(extra = "") {
  const params = new URLSearchParams({ owner_id: ownerId });
  if (extra) params.set("completed", extra);
  return `?${params.toString()}`;
}

let tasks = normalizeTasks(readLocalTasks() || []);
let hideCompleted = false;
let usingServer = false;

const listEl = document.getElementById("task-list");
const emptyEl = document.getElementById("empty-state");
const formEl = document.getElementById("add-form");
const inputEl = document.getElementById("task-input");
const countEl = document.getElementById("task-count");
const progressText = document.getElementById("progress-text");
const progressPct = document.getElementById("progress-pct");
const progressFill = document.getElementById("progress-fill");
const encourageEl = document.getElementById("encourage");
const toggleBtn = document.getElementById("toggle-completed");
const clearBtn = document.getElementById("clear-completed");
const resetBtn = document.getElementById("reset-all");
const taglineEl = document.getElementById("tagline");

(function setTagline() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric"
  });
  taglineEl.textContent = `${today} — your cute little to-do garden`;
})();

function render() {
  listEl.innerHTML = "";
  const visible = hideCompleted ? tasks.filter(t => !t.done) : tasks;

  visible.forEach(task => {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.textContent = "✓";
    check.setAttribute("aria-label", "Toggle complete");
    check.addEventListener("click", () => toggleTask(task));

    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;

    const del = document.createElement("button");
    del.className = "task-delete";
    del.type = "button";
    del.textContent = "🗑️";
    del.setAttribute("aria-label", "Delete task");
    del.addEventListener("click", () => deleteTask(task, li));

    li.append(check, span, del);
    listEl.appendChild(li);
  });

  emptyEl.hidden = visible.length > 0;
  const doneCount = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round(doneCount / total * 100);

  countEl.textContent = `${total} task${total === 1 ? "" : "s"}`;
  progressText.textContent = `${doneCount} of ${total} done`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = pct + "%";

  if (total === 0) encourageEl.textContent = "Plant your first task 🌱";
  else if (pct === 100) encourageEl.textContent = "All bloomed! You're amazing 🌸✨";
  else if (pct >= 60) encourageEl.textContent = "Almost there, keep growing! 🌷";
  else if (pct > 0) encourageEl.textContent = "Nice start, little sprout 🌿";
  else encourageEl.textContent = "You've got this! 💖";
}

async function refreshFromServer() {
  const rows = await api(`/api/tasks${ownerQuery()}`);
  tasks = normalizeTasks(rows);
  saveLocalTasks();
  render();
}

async function migrateAndLoad() {
  const saved = readLocalTasks();
  if (!localStorage.getItem(MIGRATED_KEY)) {
    // If this browser has never stored tasks, preserve Blossom's original starter list.
    if (saved === null) {
      tasks = [
        { localId: uuid(), text: "Water the plants 🌿", done: false },
        { localId: uuid(), text: "Finish reading chapter 4 📖", done: true },
        { localId: uuid(), text: "Buy strawberries 🍓", done: false },
        { localId: uuid(), text: "Stretch for 10 minutes 🧘‍♀️", done: false }
      ];
      saveLocalTasks();
    } else {
      tasks = normalizeTasks(saved);
      saveLocalTasks(); // Persist stable IDs before attempting migration.
    }

    for (const task of tasks) {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ owner_id: ownerId, ...task })
      });
    }
    // Only mark migration complete after every task has been accepted.
    localStorage.setItem(MIGRATED_KEY, "1");
  }

  await refreshFromServer();
  usingServer = true;
}

function showStorageError(error) {
  console.error(error);
  alert("Blossom couldn't sync with the server. Your browser's saved tasks are still available. Please try again when the server is online.");
}

async function addTask(text) {
  const task = { localId: uuid(), text, done: false };
  if (usingServer) {
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ owner_id: ownerId, ...task })
      });
      tasks.push(task);
      saveLocalTasks();
      render();
    } catch (error) {
      showStorageError(error);
    }
  } else {
    tasks.push(task);
    saveLocalTasks();
    render();
    // Keep the migration marker unset so the next page load retries migration.
  }
}

async function deleteTask(task, li) {
  li.classList.add("leaving");
  setTimeout(async () => {
    if (usingServer) {
      try {
        await api(`/api/tasks/${encodeURIComponent(task.localId)}${ownerQuery().replace("?", "?")}`, {
          method: "DELETE"
        });
      } catch (error) {
        showStorageError(error);
        render();
        return;
      }
    }
    tasks = tasks.filter(t => t.localId !== task.localId);
    saveLocalTasks();
    render();
  }, 240);
}

async function toggleTask(task) {
  const nextDone = !task.done;
  if (usingServer) {
    try {
      await api(`/api/tasks/${encodeURIComponent(task.localId)}`, {
        method: "PATCH",
        body: JSON.stringify({ owner_id: ownerId, done: nextDone })
      });
    } catch (error) {
      showStorageError(error);
      return;
    }
  }
  task.done = nextDone;
  saveLocalTasks();
  render();
}

formEl.addEventListener("submit", async e => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  await addTask(text);
  inputEl.value = "";
  inputEl.focus();
});

toggleBtn.addEventListener("click", () => {
  hideCompleted = !hideCompleted;
  toggleBtn.textContent = hideCompleted ? "Show completed" : "Hide completed";
  render();
});

clearBtn.addEventListener("click", async () => {
  if (!tasks.some(t => t.done)) return;
  if (usingServer) {
    try {
      await api(`/api/tasks${ownerQuery("true")}`, { method: "DELETE" });
    } catch (error) {
      showStorageError(error);
      return;
    }
  }
  tasks = tasks.filter(t => !t.done);
  saveLocalTasks();
  render();
});

resetBtn.addEventListener("click", async () => {
  if (tasks.length === 0) return;
  if (!confirm("Clear your whole garden? 🥺 This can't be undone.")) return;

  if (usingServer) {
    try {
      await api(`/api/tasks${ownerQuery()}`, { method: "DELETE" });
    } catch (error) {
      showStorageError(error);
      return;
    }
  }
  tasks = [];
  saveLocalTasks();
  render();
});

render();

// Try to sync at startup. If the API is not configured or unavailable,
// the local copy remains visible and migration is retried on the next load.
migrateAndLoad().catch(error => {
  usingServer = false;
  showStorageError(error);
  render();
});
