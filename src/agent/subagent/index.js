// Sub-agent system: agent-as-tool.
//
// The main agent can spawn a sub-agent to work on a focused subtask.
// The sub-agent runs in its own loop, with its own model/provider if specified.
// Results bubble back to the main agent as a tool result.
//
// Use cases:
//   - Main agent delegates a research task to a fast/cheap sub-agent
//   - Main agent delegates a code-reading task to a different model
//   - Main agent runs multiple sub-agents in parallel for independent subtasks
//
// Sub-agents CANNOT call `agent` (no recursion) and CANNOT call `finish`
// (they return their result instead).

import { complete } from "../../ai/providers.js";
import { TOOLS, TOOL_NAMES, toolsForPrompt, executeTool } from "../tools.js";
import { resetSession, rollbackStep, clearBackups, getAllowedRoots } from "../tools.js";
import { systemPromptSuffix } from "../../prompt.js";
import * as ui from "../../ui.js";

const SUB_AGENT_MAX_STEPS = 12; // sub-agents are scoped, fewer steps

// Strip the `agent` and `finish` tools from sub-agents to prevent recursion.
const SUB_AGENT_TOOL_NAMES = TOOL_NAMES.filter((n) => n !== "agent" && n !== "finish");

// We add a `return` tool that sub-agents use instead of `finish`.
const SUB_AGENT_TOOLS = {
  ...Object.fromEntries(SUB_AGENT_TOOL_NAMES.map((n) => [n, TOOLS[n]])),
  return: {
    description: "Return the result of your subtask. Call this once when done.",
    inputSchema: {
      type: "object",
      properties: {
        result: { type: "string", description: "The result/answer to return to the parent agent." },
      },
      required: ["result"],
    },
    terminal: true,
    run: async ({ result }) => result,
  },
};

function subAgentToolsForPrompt() {
  return Object.keys(SUB_AGENT_TOOLS).map((name) => {
    const t = SUB_AGENT_TOOLS[name];
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

function buildSubAgentPrompt(task, { allowedRoots, parentContext, model, provider }) {
  const allowedStr = allowedRoots.map((r) => `  - ${r}`).join("\n");
  const ctxStr = parentContext
    ? `\n\nParent context (the parent agent is working on a larger task):\n${parentContext.slice(0, 2000)}`
    : "";

  return `You are a DevBuddy sub-agent. You are working on a focused subtask delegated by a parent agent.

You have access to these tools:

${subAgentToolsForPrompt()}

To call a tool, emit EXACTLY this format:

TOOL: <tool_name>
<json object of arguments>
END_TOOL

Rules:
1. Call only ONE tool per turn.
2. Stay within the allowed roots.
3. When your subtask is complete, call the \`return\` tool with your result.
4. Do NOT call \`finish\` (that's for the parent agent only).
5. Max ${SUB_AGENT_MAX_STEPS} tool calls.
6. Be focused — you're a specialist, not the orchestrator.

Allowed roots:
${allowedStr}

Current working directory: ${process.cwd()}
${ctxStr}

Your subtask: ${task}

Begin.`;
}

function parseToolCall(text) {
  const m = text.match(/TOOL:\s*(\w+)\s*\n([\s\S]*?)\nEND_TOOL/);
  if (!m) return null;
  const name = m[1].trim();
  const argsRaw = m[2].trim();
  if (!SUB_AGENT_TOOLS[name]) return { name: null, error: `Unknown tool '${name}'` };
  try {
    return { name, args: JSON.parse(argsRaw) };
  } catch (e) {
    return { name, error: `Invalid JSON args: ${e.message}` };
  }
}

/**
 * Run a sub-agent.
 * @param {string} task           the focused subtask
 * @param {object} opts
 * @param {string} [opts.model]   override model for this sub-agent
 * @param {string} [opts.parentContext]  context from the parent (so sub-agent knows the bigger picture)
 * @param {boolean} [opts.yolo]   skip confirms
 * @param {string[]} [opts.allow]  extra allowed roots
 * @returns {Promise<{steps: number, result: string}>}
 */
export async function runSubAgent(task, opts = {}) {
  const yolo = !!opts.yolo;
  const allowExtra = opts.allow || [];

  // Reset session for this sub-agent (inherits CWD + parent's extra roots)
  resetSession(allowExtra);
  const allowedRoots = getAllowedRoots();

  const history = [
    { role: "user", content: buildSubAgentPrompt(task, {
      allowedRoots,
      parentContext: opts.parentContext || "",
      model: opts.model,
    }) },
  ];

  let steps = 0;
  let result = "(sub-agent did not return a result)";

  ui.blank();
  ui.muted(`  ┌─ sub-agent started ───────────────────`);
  ui.muted(`  │ task: ${task.slice(0, 80)}`);
  if (opts.model) ui.muted(`  │ model: ${opts.model}`);
  ui.muted(`  │ max-steps: ${SUB_AGENT_MAX_STEPS}`);

  while (steps < SUB_AGENT_MAX_STEPS) {
    steps++;
    let assistantText;
    try {
      assistantText = await complete(null, {
        messages: history,
        model: opts.model,
        maxTokens: 1500,
        temperature: 0.2,
      });
    } catch (e) {
      ui.muted(`  │ ✗ model call failed: ${e.message}`);
      break;
    }

    history.push({ role: "assistant", content: assistantText });
    const call = parseToolCall(assistantText);

    if (!call) {
      history.push({
        role: "user",
        content: "You did not call a tool. Call a tool now, or call `return` with your result.",
      });
      continue;
    }

    if (call.error) {
      history.push({ role: "user", content: `Tool call error: ${call.error}. Try again.` });
      continue;
    }

    clearBackups();
    let toolResult;
    try {
      // For sub-agents, run silently unless yolo is off
      if (!yolo && SUB_AGENT_TOOLS[call.name].confirm) {
        ui.muted(`  │ [confirm] ${call.name}: ${JSON.stringify(call.args).slice(0, 100)}`);
      }
      toolResult = await executeTool(call.name, call.args, { yolo });
    } catch (e) {
      const n = rollbackStep();
      if (n > 0) ui.muted(`  │ rolled back ${n} mutations`);
      toolResult = `ERROR: ${e.message}`;
    }

    const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
    const trimmed = resultStr.length > 2000
      ? resultStr.slice(0, 2000) + `... (truncated)`
      : resultStr;

    ui.muted(`  │ step ${steps}: ${call.name} → ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`);

    history.push({
      role: "user",
      content: `Tool ${call.name} result:\n${trimmed}\n\nContinue. Call the next tool, or call \`return\` with your result.`,
    });

    if (call.name === "return") {
      result = call.args.result || "(empty result)";
      break;
    }
  }

  if (steps >= SUB_AGENT_MAX_STEPS) {
    result = `(sub-agent hit max-steps=${SUB_AGENT_MAX_STEPS}; partial result: ${result})`;
  }

  ui.muted(`  └─ sub-agent done (${steps} steps)`);
  ui.blank();

  return { steps, result };
}
