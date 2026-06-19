// Tools available to the agent (v0.4 — upgraded).
//
// New in v0.4:
//   - Per-session allowlist: agent can be granted access to dirs beyond CWD.
//   - Parallel-safe tools: read-only tools can run in parallel (caller decides).
//   - Auto-rollback tracking: every mutating op records a backup; the caller
//     can roll back all mutations in the current step if a later tool fails.
//   - Project context: tools receive the loaded DEVBUDDY.md so the agent
//     "knows" project conventions.
//
// Inspired by OpenClaude (tool registry), Hermes (provider abstraction),
// and Aider (auto-rollback on failure). Still ~300 lines.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync, readdirSync } from "node:fs";
import { dirname, resolve, isAbsolute, join } from "node:path";
import { execSync } from "node:child_process";
import * as ui from "../ui.js";

// --- Allowlist enforcement -----------------------------------------------

// Default allowed root: CWD. User can grant more via `agent run --allow <dir>`.
let _allowedRoots = [process.cwd()];
// Backups for rollback: array of { kind: 'write'|'edit', path, originalContent|null }
let _backups = [];

export function resetSession(extraRoots = []) {
  _allowedRoots = [process.cwd(), ...extraRoots.map((r) => resolve(r))];
  _backups = [];
}

export function getAllowedRoots() {
  return [..._allowedRoots];
}

export function isPathAllowed(p) {
  const target = isAbsolute(p) ? p : resolve(process.cwd(), p);
  return _allowedRoots.some((root) => {
    const r = root.endsWith("/") ? root : root + "/";
    return target === root || target.startsWith(r);
  });
}

function enforcePath(p) {
  if (!isPathAllowed(p)) {
    throw new Error(
      `Refusing to access path outside allowed roots: ${p}\n` +
      `  allowed: ${_allowedRoots.join(", ")}\n` +
      `  grant more with: devbuddy agent run --allow <dir>`
    );
  }
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

// --- Rollback tracking ---------------------------------------------------

function recordBackup(kind, fullPath, originalContent) {
  _backups.push({ kind, path: fullPath, originalContent });
}

// Roll back all mutations recorded in the current step.
// Returns the number of operations rolled back.
export function rollbackStep() {
  const n = _backups.length;
  for (const b of _backups) {
    try {
      if (b.originalContent === null) {
        // File was newly created — delete it
        if (existsSync(b.path)) unlinkSync(b.path);
      } else {
        // File was overwritten — restore original
        writeFileSync(b.path, b.originalContent);
      }
    } catch (e) {
      ui.warn(`rollback failed for ${b.path}: ${e.message}`);
    }
  }
  _backups = [];
  return n;
}

export function clearBackups() {
  _backups = [];
}

// --- Tool registry -------------------------------------------------------

export const TOOLS = {
  read_file: {
    description: "Read the contents of a file. Path is relative to CWD unless absolute.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    parallelSafe: true,
    run: async ({ path }) => {
      const full = enforcePath(path);
      if (!existsSync(full)) throw new Error(`File not found: ${path}`);
      const stat = statSync(full);
      if (stat.size > 200_000) {
        throw new Error(`File too large (${stat.size} bytes). Max 200KB per read.`);
      }
      return readFileSync(full, "utf8");
    },
  },

  write_file: {
    description: "Write a new file (or overwrite an existing one). Creates parent directories. Records a backup for rollback.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    confirm: true,
    run: async ({ path, content }) => {
      const full = enforcePath(path);
      mkdirSync(dirname(full), { recursive: true });
      const existed = existsSync(full);
      const original = existed ? readFileSync(full, "utf8") : null;
      recordBackup("write", full, original);
      writeFileSync(full, content);
      return `Wrote ${content.length} chars to ${path}${existed ? " (overwrote existing)" : " (new file)"}`;
    },
  },

  edit_file: {
    description: "Edit an existing file by replacing a unique old_string with new_string. Fails if old_string appears more than once. Records a backup for rollback.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
      },
      required: ["path", "old_string", "new_string"],
    },
    confirm: true,
    run: async ({ path, old_string, new_string }) => {
      const full = enforcePath(path);
      if (!existsSync(full)) throw new Error(`File not found: ${path}`);
      const original = readFileSync(full, "utf8");
      const count = original.split(old_string).length - 1;
      if (count === 0) throw new Error(`old_string not found in ${path}.`);
      if (count > 1) throw new Error(`old_string appears ${count} times in ${path}; needs to be unique.`);
      recordBackup("edit", full, original);
      const updated = original.replace(old_string, new_string);
      writeFileSync(full, updated);
      return `Edited ${path}: replaced ${old_string.length} chars with ${new_string.length} chars`;
    },
  },

  list_files: {
    description: "List files in a directory (one level deep). Path defaults to CWD.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
    parallelSafe: true,
    run: async ({ path = "." } = {}) => {
      const full = enforcePath(path);
      if (!existsSync(full)) throw new Error(`Directory not found: ${path}`);
      const entries = readdirSync(full, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "d" : "f"}  ${e.name}`)
        .join("\n");
    },
  },

  glob_search: {
    description: "Search for files matching a glob pattern (e.g. 'src/**/*.js'). Uses shell 'find'. Returns up to 50 paths.",
    inputSchema: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: ["pattern"],
    },
    parallelSafe: true,
    run: async ({ pattern }) => {
      // Use find with -path for simplicity. Limit to allowed roots.
      try {
        const cmd = `find ${_allowedRoots.map((r) => `"${r}"`).join(" ")} -type f -path "*${pattern.replace(/["]/g, "")}*" 2>/dev/null | head -50`;
        const out = execSync(cmd, { encoding: "utf8", timeout: 10_000, maxBuffer: 200_000 });
        return out.trim() || "(no matches)";
      } catch (e) {
        return `(search failed: ${e.message})`;
      }
    },
  },

  run_shell: {
    description: "Run a shell command. Returns stdout. Dangerous — requires explicit confirmation unless --yolo. 30s timeout.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    confirm: true,
    dangerous: true,
    run: async ({ command }) => {
      try {
        const out = execSync(command, {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 30_000,
          maxBuffer: 1_000_000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return out || "(no output)";
      } catch (e) {
        throw new Error(`Command failed (exit ${e.status}): ${e.stderr || e.message}`);
      }
    },
  },

  plan: {
    description: "Record a multi-step plan. Call this once at the start if the task is complex. The plan is shown to the user and used as a checklist.",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of step descriptions.",
        },
      },
      required: ["steps"],
    },
    terminal: false,
    run: async ({ steps }) => {
      return `PLAN:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    },
  },

  finish: {
    description: "Signal that the task is complete. Call this once when you're done.",
    inputSchema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
    terminal: true,
    run: async ({ summary }) => summary,
  },
};

// `agent` tool is added at runtime (in core.js) because it imports subagent
// which imports tools.js — circular import. We register it as a function instead.
export function registerSubAgentTool(subAgentRunner) {
  TOOLS.agent = {
    description: "Spawn a sub-agent to work on a focused subtask. Sub-agent has its own loop and tools (no agent/finish). Use for research, file analysis, or parallel independent subtasks. Sub-agent can use a different model if you specify one.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The focused subtask for the sub-agent." },
        model: { type: "string", description: "Optional: model override for the sub-agent (e.g. 'gpt-4o-mini' or 'claude-3-5-haiku-20241022')." },
        context: { type: "string", description: "Optional: extra context to pass to the sub-agent about the parent's goal." },
      },
      required: ["task"],
    },
    confirm: false,  // spawning is non-destructive; the sub-agent's own tool calls will prompt
    run: async ({ task, model, context }) => {
      const { runSubAgent } = await import("./subagent/index.js");
      const { result } = await runSubAgent(task, {
        model,
        parentContext: context || "",
        yolo: false, // sub-agent always confirms its own mutations
        allow: [],   // inherits parent's allowlist via resetSession
      });
      return result;
    },
  };
}

export const TOOL_NAMES = Object.keys(TOOLS);

// Get current tool names (including dynamically-registered ones like `agent`).
export function getToolNames() {
  return Object.keys(TOOLS);
}

// --- Tool spec for the system prompt ------------------------------------

export function toolsForPrompt() {
  return Object.keys(TOOLS).map((name) => {
    const t = TOOLS[name];
    const params = Object.entries(t.inputSchema.properties || {})
      .map(([k, v]) => `${k}: ${v.description || v.type}`)
      .join("; ");
    const tags = [];
    if (t.parallelSafe) tags.push("parallel-safe");
    if (t.confirm) tags.push("needs-confirm");
    if (t.dangerous) tags.push("dangerous");
    const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
    return `- ${name}(${params})${tagStr} — ${t.description}`;
  }).join("\n");
}

// --- Execute a tool with optional confirmation --------------------------

export async function executeTool(name, args, opts = {}) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  if (tool.confirm && !opts.yolo) {
    const label = tool.dangerous ? ui.theme.err("[DANGEROUS]") : ui.theme.warn("[CONFIRM]");
    ui.blank();
    console.log(`  ${label} ${ui.theme.heading(name)} ${ui.theme.muted(JSON.stringify(args).slice(0, 200))}`);
    if (tool.dangerous && name === "run_shell" && args.command) {
      console.log(`  ${ui.theme.arrow} ${ui.theme.value(args.command)}`);
    }
    const answer = await _prompt("  Proceed? [y/N] ");
    if (!/^\s*y(es)?\s*$/i.test(answer)) {
      return "(skipped by user)";
    }
  } else if (tool.confirm && opts.yolo) {
    ui.muted(`  [yolo] ${name} ${JSON.stringify(args).slice(0, 120)}`);
  }

  return tool.run(args);
}

// --- Execute multiple read-only tools in parallel -----------------------

export async function executeToolsParallel(calls, opts = {}) {
  // calls: [{ name, args }, ...] — all must be parallelSafe tools.
  const invalid = calls.filter((c) => !TOOLS[c.name]?.parallelSafe);
  if (invalid.length > 0) {
    throw new Error(
      `Cannot run in parallel: ${invalid.map((c) => c.name).join(", ")} (not parallel-safe).`
    );
  }
  return Promise.all(calls.map(async (c) => {
    try {
      const result = await TOOLS[c.name].run(c.args);
      return { name: c.name, args: c.args, ok: true, result };
    } catch (e) {
      return { name: c.name, args: c.args, ok: false, error: e.message };
    }
  }));
}

function _prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let buf = "";
    const onData = (chunk) => {
      const s = chunk.toString();
      buf += s;
      if (s.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf.trim());
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}
