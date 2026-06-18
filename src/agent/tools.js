// Tools available to the agent.
//
// Design inspired by OpenClaude's tool registry and Hermes' minimal file ops:
// each tool is a plain function with a JSON-schema-ish spec. The agent core
// stays tiny — tools are self-contained.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve, isAbsolute, join } from "node:path";
import { execSync } from "node:child_process";
import * as ui from "../ui.js";

// All file/shell operations are constrained to CWD by default to prevent the
// agent from wandering outside the user's project. resolve() + check.
function safePath(p) {
  const cwd = process.cwd();
  const target = isAbsolute(p) ? p : resolve(cwd, p);
  if (!target.startsWith(cwd)) {
    throw new Error(`Refusing to access path outside CWD: ${p} (resolved: ${target})`);
  }
  return target;
}

// --- Tool registry ---------------------------------------------------------

export const TOOLS = {
  read_file: {
    description: "Read the contents of a file. Path is relative to CWD.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file." },
      },
      required: ["path"],
    },
    run: async ({ path }) => {
      const full = safePath(path);
      if (!existsSync(full)) throw new Error(`File not found: ${path}`);
      const stat = statSync(full);
      if (stat.size > 200_000) {
        throw new Error(`File too large (${stat.size} bytes). Max 200KB per read.`);
      }
      return readFileSync(full, "utf8");
    },
  },

  write_file: {
    description: "Write a new file (or overwrite an existing one). Creates parent directories.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file." },
        content: { type: "string", description: "Full file content." },
      },
      required: ["path", "content"],
    },
    confirm: true,
    run: async ({ path, content }) => {
      const full = safePath(path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
      return `Wrote ${content.length} chars to ${path}`;
    },
  },

  edit_file: {
    description: "Edit an existing file by replacing a unique old_string with new_string. Fails if old_string appears more than once.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string", description: "Exact text to find (must be unique in the file)." },
        new_string: { type: "string", description: "Replacement text." },
      },
      required: ["path", "old_string", "new_string"],
    },
    confirm: true,
    run: async ({ path, old_string, new_string }) => {
      const full = safePath(path);
      if (!existsSync(full)) throw new Error(`File not found: ${path}`);
      const original = readFileSync(full, "utf8");
      const count = original.split(old_string).length - 1;
      if (count === 0) throw new Error(`old_string not found in ${path}.`);
      if (count > 1) throw new Error(`old_string appears ${count} times in ${path}; needs to be unique.`);
      const updated = original.replace(old_string, new_string);
      writeFileSync(full, updated);
      return `Edited ${path}: replaced ${old_string.length} chars with ${new_string.length} chars`;
    },
  },

  list_files: {
    description: "List files in a directory (one level deep). Path defaults to CWD.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative directory path. Default: '.'" },
      },
    },
    run: async ({ path = "." } = {}) => {
      const full = safePath(path);
      if (!existsSync(full)) throw new Error(`Directory not found: ${path}`);
      const { readdirSync } = await import("node:fs");
      const entries = readdirSync(full, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "d" : "f"}  ${e.name}`)
        .join("\n");
    },
  },

  run_shell: {
    description: "Run a shell command. Returns stdout. Dangerous — requires explicit confirmation unless --yolo.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run." },
      },
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

  finish: {
    description: "Signal that the task is complete. Call this once when you're done.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Final summary of what was done." },
      },
      required: ["summary"],
    },
    terminal: true,
    run: async ({ summary }) => summary,
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

// --- Tool spec for the system prompt ---------------------------------------

export function toolsForPrompt() {
  return TOOL_NAMES.map((name) => {
    const t = TOOLS[name];
    const params = Object.entries(t.inputSchema.properties || {})
      .map(([k, v]) => `${k}: ${v.description || v.type}`)
      .join("; ");
    return `- ${name}(${params}) — ${t.description}`;
  }).join("\n");
}

// --- Execute a tool call with optional confirmation ------------------------

export async function executeTool(name, args, opts = {}) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  // Confirm dangerous / mutating actions unless --yolo
  if (tool.confirm && !opts.yolo) {
    const label = tool.dangerous ? ui.theme.err("[DANGEROUS]") : ui.theme.warn("[CONFIRM]");
    ui.blank();
    console.log(`  ${label} ${ui.theme.heading(name)} ${ui.theme.muted(JSON.stringify(args).slice(0, 200))}`);
    if (tool.dangerous) {
      // For shell commands, show the full command clearly
      if (name === "run_shell" && args.command) {
        console.log(`  ${ui.theme.arrow} ${ui.theme.value(args.command)}`);
      }
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

// --- Minimal stdin prompt (no deps) ---

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
