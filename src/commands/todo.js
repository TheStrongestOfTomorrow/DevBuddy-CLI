// `devbuddy todo` — local todo management with priorities.

import { loadTodos, saveTodos } from "../store.js";
import * as ui from "../ui.js";

const PRIORITY_LABEL = {
  high:   { label: "high",   color: (s) => ui.theme.err(s) },
  medium: { label: "medium", color: (s) => ui.theme.warn(s) },
  low:    { label: "low",    color: (s) => ui.theme.muted(s) },
};

function nextId(todos) {
  return todos.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}

function renderTodos(todos) {
  if (todos.length === 0) {
    ui.muted("  (no todos) — add one with `devbuddy todo add <text>`");
    return;
  }
  const now = Date.now();
  for (const t of todos) {
    const status = t.done
      ? ui.theme.ok("✓")
      : ui.theme.muted("•");
    const prio = (PRIORITY_LABEL[t.priority] || PRIORITY_LABEL.medium).color(
      t.priority || "medium"
    );
    const age = Math.floor((now - new Date(t.createdAt)) / 86400000);
    const ageStr = age <= 0 ? "today" : `${age}d ago`;
    const text = t.done ? ui.theme.muted(t.text) : t.text;
    console.log(
      `  ${status} ${ui.theme.muted("#" + t.id)} ${prio} ${text} ${ui.theme.muted("· " + ageStr)}`
    );
  }
}

function filterAndSort(todos) {
  return [...todos]
    .sort((a, b) => {
      // Open before done
      if (a.done !== b.done) return a.done ? 1 : -1;
      // Higher priority first
      const order = { high: 0, medium: 1, low: 2 };
      const pa = order[a.priority] ?? 1;
      const pb = order[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      // Older first
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

export function register(program) {
  const todo = program.command("todo").description("Manage quick todos.");

  todo
    .command("add <text...>")
    .description("Add a new todo.")
    .option("-p, --priority <level>", "high | medium | low", "medium")
    .action((parts, opts) => {
      const text = parts.join(" ").trim();
      if (!text) { ui.error("todo text is required"); process.exit(1); }
      const todos = loadTodos();
      const t = {
        id: nextId(todos),
        text,
        priority: ["high", "medium", "low"].includes(opts.priority)
          ? opts.priority
          : "medium",
        done: false,
        createdAt: new Date().toISOString(),
      };
      todos.push(t);
      saveTodos(todos);
      ui.ok(`added #${t.id}: ${t.text}`);
    });

  todo
    .command("list")
    .description("List todos (default).")
    .option("--all", "Show completed todos too (default).")
    .option("--open", "Only show open todos.")
    .option("--done", "Only show completed todos.")
    .action((opts) => {
      let todos = loadTodos();
      if (opts.open) todos = todos.filter((t) => !t.done);
      else if (opts.done) todos = todos.filter((t) => t.done);
      renderTodos(filterAndSort(todos));
    });

  todo
    .command("done <id>")
    .description("Mark a todo as done.")
    .action((id) => {
      const num = parseInt(id, 10);
      const todos = loadTodos();
      const t = todos.find((x) => x.id === num);
      if (!t) { ui.error(`no todo #${id}`); process.exit(1); }
      t.done = true;
      t.completedAt = new Date().toISOString();
      saveTodos(todos);
      ui.ok(`done #${t.id}: ${t.text}`);
    });

  todo
    .command("undo <id>")
    .description("Reopen a completed todo.")
    .action((id) => {
      const num = parseInt(id, 10);
      const todos = loadTodos();
      const t = todos.find((x) => x.id === num);
      if (!t) { ui.error(`no todo #${id}`); process.exit(1); }
      t.done = false;
      delete t.completedAt;
      saveTodos(todos);
      ui.ok(`reopened #${t.id}: ${t.text}`);
    });

  todo
    .command("rm <id>")
    .description("Remove a todo.")
    .action((id) => {
      const num = parseInt(id, 10);
      const todos = loadTodos();
      const i = todos.findIndex((x) => x.id === num);
      if (i === -1) { ui.error(`no todo #${id}`); process.exit(1); }
      const [removed] = todos.splice(i, 1);
      saveTodos(todos);
      ui.ok(`removed #${removed.id}: ${removed.text}`);
    });

  todo
    .command("clear")
    .description("Remove all completed todos.")
    .action(() => {
      const todos = loadTodos();
      const before = todos.length;
      const kept = todos.filter((t) => !t.done);
      saveTodos(kept);
      ui.ok(`cleared ${before - kept.length} completed todo(s).`);
    });

  // Default action when no subcommand: list
  todo.action(() => {
    renderTodos(filterAndSort(loadTodos()));
  });
}
