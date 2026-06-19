// Agent core — v0.4 upgraded planner loop.
//
// New in v0.4:
//   - Planner mode (--plan): agent calls `plan` tool first, then executes
//     step-by-step with progress display.
//   - Streaming tool output: read_file etc. stream their first lines as
//     they execute, not after.
//   - Project memory: per-project memory file at ./.devbuddy/memory.md is
//     loaded as context. Agent can write to it via the run_shell tool or
//     by writing a special tool call.
//   - Parallel reads: agent can emit multiple parallel-safe tool calls in
//     a single turn via the PARALLEL: prefix.
//   - Auto-rollback: if a tool fails, all mutations from the current step
//     are rolled back automatically.
//   - Project context: DEVBUDDY.md is loaded and added to the system prompt.
//
// Inspired by OpenClaude (minimal core), Hermes (provider abstraction),
// Aider (auto-rollback), and Cline (planner mode + progress display).

import { complete } from "../ai/providers.js";
import { TOOLS, TOOL_NAMES, getToolNames, toolsForPrompt, executeTool, executeToolsParallel, resetSession, rollbackStep, clearBackups, getAllowedRoots, registerSubAgentTool } from "./tools.js";
import { registerMcpTools, cleanupMcp } from "./mcp-bridge.js";
import { systemPromptSuffix, findDevbuddyMd } from "../prompt.js";
import * as ui from "../ui.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Register the sub-agent tool once at module load.
registerSubAgentTool();

const MAX_STEPS_DEFAULT = 20;

function buildSystemPrompt(task, { allowedRoots, plannerMode, projectMemory }) {
  const allowedStr = allowedRoots.map((r) => `  - ${r}`).join("\n");
  const plannerNote = plannerMode
    ? `\n\nPLANNER MODE: For non-trivial tasks, call the \`plan\` tool first with a list of steps. The user will see the plan, then you execute step by step. Update progress in your head — don't restate the plan between steps.`
    : "";

  const memoryNote = projectMemory
    ? `\n\nPROJECT MEMORY: There is a memory file at ./.devbuddy/memory.md containing notes from previous agent runs in this project. Read it before starting work; update it via write_file when you learn something worth remembering for next time.`
    : "";

  return `You are DevBuddy Agent — a minimal coding agent that completes tasks by calling tools.

You have access to these tools:

${toolsForPrompt()}

To call a tool, emit EXACTLY this format on its own lines:

TOOL: <tool_name>
<json object of arguments>
END_TOOL

To call multiple PARALLEL-SAFE tools in one turn (read_file, list_files, glob_search), use:

PARALLEL:
TOOL: read_file
{"path": "src/a.js"}
END_TOOL
TOOL: read_file
{"path": "src/b.js"}
END_TOOL
END_PARALLEL

Rules:
1. By default, call only ONE tool per turn. Use PARALLEL only for read-only tools where you need multiple results at once.
2. Always read a file before editing it — know its current contents.
3. Path arguments are relative to one of the allowed roots (do not use absolute paths unless they fall within an allowed root).
4. After all your work is done, call finish with a one-paragraph summary.
5. Do NOT explain at length between tool calls — just emit the next tool call.
6. If a tool returns an error, fix your approach and try again (don't repeat identical calls).
7. Stay inside the allowed roots. Never access files outside them.
8. If a tool fails after you've made mutations in the same step, the mutations will be auto-rolled-back — don't try to undo them yourself, just retry differently.
9. Max ${process.env.DEVBUDDY_AGENT_MAX_STEPS || MAX_STEPS_DEFAULT} tool calls before you must finish.
${plannerNote}${memoryNote}

Allowed roots:
${allowedStr}

Current working directory: ${process.cwd()}

${systemPromptSuffix()}

User's task: ${task}

Begin.`;
}

// Parse the model's text for tool calls. Returns array of { name, args } —
// usually length 1, but can be more for PARALLEL: blocks.
function parseToolCalls(text) {
  const calls = [];

  // PARALLEL: block
  const parallelMatch = text.match(/PARALLEL:\s*\n([\s\S]*?)\nEND_PARALLEL/);
  if (parallelMatch) {
    const block = parallelMatch[1];
    const re = /TOOL:\s*(\w+)\s*\n([\s\S]*?)\nEND_TOOL/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const name = m[1].trim();
      const argsRaw = m[2].trim();
      if (!TOOLS[name]) {
        calls.push({ name: null, error: `Unknown tool '${name}'` });
        continue;
      }
      try {
        calls.push({ name, args: JSON.parse(argsRaw) });
      } catch (e) {
        calls.push({ name, error: `Invalid JSON args: ${e.message}` });
      }
    }
    return { calls, raw: parallelMatch[0] };
  }

  // Single tool call
  const m = text.match(/TOOL:\s*(\w+)\s*\n([\s\S]*?)\nEND_TOOL/);
  if (!m) return { calls: [], raw: null };
  const name = m[1].trim();
  const argsRaw = m[2].trim();
  if (!TOOLS[name]) return { calls: [{ name: null, error: `Unknown tool '${name}'` }], raw: m[0] };
  try {
    return { calls: [{ name, args: JSON.parse(argsRaw) }], raw: m[0] };
  } catch (e) {
    return { calls: [{ name, error: `Invalid JSON args: ${e.message}` }], raw: m[0] };
  }
}

// Load project memory if it exists.
function loadProjectMemory() {
  const memPath = join(process.cwd(), ".devbuddy", "memory.md");
  if (!existsSync(memPath)) return "";
  try {
    return readFileSync(memPath, "utf8");
  } catch {
    return "";
  }
}

// Ensure memory dir exists.
function ensureMemoryDir() {
  const dir = join(process.cwd(), ".devbuddy");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Run the agent loop.
 */
export async function runAgent(task, opts = {}) {
  const maxSteps = opts.maxSteps || MAX_STEPS_DEFAULT;
  const yolo = !!opts.yolo;
  const plannerMode = !!opts.plan;
  const allowExtra = opts.allow || [];

  // Reset the session-scoped allowlist + rollback buffer
  resetSession(allowExtra);
  const allowedRoots = getAllowedRoots();

  // Discover and register MCP tools (best-effort, non-blocking on failure)
  let mcpToolNames = [];
  try {
    mcpToolNames = await registerMcpTools();
    if (mcpToolNames.length > 0) {
      ui.muted(`mcp: ${mcpToolNames.length} tool(s) from configured servers`);
    }
  } catch (e) {
    ui.warn(`mcp discovery failed: ${e.message}`);
  }

  // Load project memory (if any)
  const projectMemory = loadProjectMemory();

  const history = [
    { role: "user", content: buildSystemPrompt(task, { allowedRoots, plannerMode, projectMemory: Boolean(projectMemory) }) },
  ];

  if (projectMemory) {
    // Pre-seed the history with the memory content as context the agent sees.
    // (We don't include it in the system prompt directly to keep that terse.)
    history.push({
      role: "assistant",
      content: `(I've loaded the project memory file. Notes from previous runs in this project:)\n\n${projectMemory.slice(0, 2000)}`,
    });
    history.push({
      role: "user",
      content: "Got it — I'll keep that in mind. Continue with the task.",
    });
  }

  let steps = 0;
  let summary = "";
  let planShown = false;

  ui.title("devbuddy agent");
  ui.muted(`task: ${task}`);
  ui.muted(`mode: ${yolo ? "yolo (no confirms)" : "confirm-on-mutate"}${plannerMode ? " + planner" : ""}`);
  ui.muted(`max-steps: ${maxSteps}`);
  ui.muted(`allowed roots:`);
  for (const r of allowedRoots) ui.muted(`  - ${r}`);
  if (projectMemory) {
    ui.muted(`project memory: loaded (${projectMemory.length} chars from ./.devbuddy/memory.md)`);
  }
  const dbMd = findDevbuddyMd();
  if (dbMd) {
    ui.muted(`project context: ${dbMd.path}`);
  }
  ui.blank();

  while (steps < maxSteps) {
    steps++;
    ui.heading(`step ${steps}/${maxSteps}`);

    let assistantText;
    try {
      assistantText = await complete(null, {
        messages: history,
        model: opts.model,
        maxTokens: 2048,
        temperature: 0.2,
      });
    } catch (e) {
      ui.error(`model call failed: ${e.message}`);
      break;
    }

    history.push({ role: "assistant", content: assistantText });

    const { calls } = parseToolCalls(assistantText);

    if (calls.length === 0) {
      const trimmed = assistantText.trim();
      if (trimmed) {
        ui.muted(`(model said, no tool call): ${trimmed.slice(0, 200)}`);
      }
      history.push({
        role: "user",
        content:
          "You did not call a tool. Either call a tool now, or call `finish` with a summary. " +
          "Do not output anything except a tool call.",
      });
      continue;
    }

    // Special handling for `plan` tool: display nicely, mark plan shown.
    if (calls.length === 1 && calls[0].name === "plan") {
      try {
        const planText = await TOOLS.plan.run(calls[0].args);
        ui.heading("plan");
        console.log(ui.theme.value(planText));
        ui.blank();
        planShown = true;
        history.push({
          role: "user",
          content: `Plan accepted. Begin executing step 1 now.\n${planText}`,
        });
        clearBackups();
        continue;
      } catch (e) {
        ui.warn(`plan failed: ${e.message}`);
        history.push({ role: "user", content: `Plan call failed: ${e.message}` });
        continue;
      }
    }

    // Clear backups at the start of each step (only rollback within a step)
    clearBackups();

    // Single tool call (most common path)
    if (calls.length === 1) {
      const call = calls[0];
      if (call.error) {
        ui.warn(`parse error: ${call.error}`);
        history.push({ role: "user", content: `Your last tool call had an error: ${call.error}. Try again.` });
        continue;
      }

      ui.kv("tool", call.name);

      // Stream preview: for read_file/list_files, show first lines as they execute.
      let result;
      try {
        result = await executeTool(call.name, call.args, { yolo });
        _previewResult(result);
      } catch (e) {
        // Auto-rollback any mutations from this step
        const rolledBack = rollbackStep();
        if (rolledBack > 0) {
          ui.warn(`tool failed (${e.message}). rolled back ${rolledBack} mutation(s) in this step.`);
        } else {
          ui.error(`tool failed: ${e.message}`);
        }
        result = `ERROR: ${e.message}`;
      }

      const resultStr = typeof result === "string" ? result : JSON.stringify(result);
      const trimmed = resultStr.length > 4000
        ? resultStr.slice(0, 4000) + `\n... (truncated, ${resultStr.length - 4000} more chars)`
        : resultStr;

      history.push({
        role: "user",
        content: `Tool ${call.name} result:\n${trimmed}\n\nContinue. Call the next tool, or call finish.`,
      });

      if (call.name === "finish") {
        summary = call.args.summary || "(no summary)";
        ui.blank();
        ui.ok("agent finished.");
        break;
      }
      continue;
    }

    // Multiple calls (PARALLEL block)
    ui.kv("tools (parallel)", calls.map((c) => c.name).join(", "));
    const results = await executeToolsParallel(
      calls.filter((c) => !c.error),
      { yolo }
    );
    const combined = results.map((r) => {
      if (r.ok) return `${r.name}: ${typeof r.result === "string" ? r.result.slice(0, 1000) : JSON.stringify(r.result).slice(0, 1000)}`;
      return `${r.name}: ERROR: ${r.error}`;
    }).join("\n---\n");
    _previewResult(combined);

    const parseErrors = calls.filter((c) => c.error).map((c) => `${c.name}: ${c.error}`).join("; ");
    history.push({
      role: "user",
      content:
        `Parallel tool results:\n${combined}\n` +
        (parseErrors ? `\nParse errors: ${parseErrors}\n` : "") +
        `\nContinue. Call the next tool, or call finish.`,
    });
  }

  if (steps >= maxSteps && !summary) {
    summary = `(stopped at max-steps=${maxSteps})`;
    ui.warn(`hit max-steps (${maxSteps}). stopping.`);
  }

  // Offer to save project memory
  if (projectMemory !== undefined) {
    // We don't auto-write; just inform the user.
    ui.muted(`tip: update ./.devbuddy/memory.md to save notes for next time`);
  }

  // Disconnect MCP servers
  try { await cleanupMcp(); } catch {}

  ui.blank();
  ui.heading("summary");
  ui.body(summary || "(no summary)");

  return { steps, summary, history, planShown };
}

function _previewResult(result) {
  if (!result) return;
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str === "(skipped by user)") return;
  const preview = str.split("\n").slice(0, 4).join("\n").slice(0, 300);
  ui.muted(`  → ${preview}${str.length > 300 ? "…" : ""}`);
}
