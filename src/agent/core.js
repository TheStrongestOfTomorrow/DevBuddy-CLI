// Agent core — minimal planner loop.
//
// Inspired by OpenClaude (single-file agent, tool-use loop) and Hermes
// (provider abstraction), but stripped to the essentials:
//
//   1. Build a system prompt describing available tools.
//   2. Send user's task + system prompt + conversation history to the model.
//   3. Parse model's response. If it contains a tool call, execute the tool
//      and append the result to history. Otherwise, treat as a normal message.
//   4. Repeat until the model calls `finish` or we hit max-steps.
//
// Tool-call format: the model emits a line like:
//   TOOL: <name>
//   <json args on one line>
//   END_TOOL
//
// We picked this plain-text format over JSON-only because it works across
// every provider (some providers' smaller models are bad at pure JSON).

import { complete } from "../ai/providers.js";
import { TOOLS, TOOL_NAMES, toolsForPrompt, executeTool } from "./tools.js";
import * as ui from "../ui.js";

const SYSTEM_PROMPT = (task) => `You are DevBuddy Agent — a minimal coding agent that completes tasks by calling tools.

You have access to these tools:

${toolsForPrompt()}

To call a tool, emit EXACTLY this format on its own lines:

TOOL: <tool_name>
<json object of arguments>
END_TOOL

Examples:
TOOL: read_file
{"path": "src/index.js"}
END_TOOL

TOOL: write_file
{"path": "src/hello.js", "content": "console.log('hi')"}
END_TOOL

TOOL: edit_file
{"path": "package.json", "old_string": "\\"version\\": \\"0.0.0\\"", "new_string": "\\"version\\": \\"1.0.0\\""}
END_TOOL

TOOL: run_shell
{"command": "npm test"}
END_TOOL

TOOL: finish
{"summary": "I added a hello world route and ran the tests."}
END_TOOL

Rules:
1. Call only ONE tool per turn. Wait for the result before the next call.
2. Always read a file before editing it — know its current contents.
3. Path arguments are relative to the current working directory (do not use absolute paths).
4. After all your work is done, call finish with a one-paragraph summary.
5. Do NOT explain at length between tool calls — just emit the next tool call.
6. If a tool returns an error, fix your approach and try again (don't repeat identical calls).
7. Stay inside the project directory. Never access files outside the CWD.
8. Max ${parseInt(process.env.DEVBUDDY_AGENT_MAX_STEPS || "20", 10)} tool calls before you must finish.

Current working directory: ${process.cwd()}

User's task: ${task}

Begin.`;

// Parse the model's text for the FIRST tool call. Returns { name, args } or null.
function parseToolCall(text) {
  const m = text.match(/TOOL:\s*(\w+)\s*\n([\s\S]*?)\nEND_TOOL/);
  if (!m) return null;
  const name = m[1].trim();
  const argsRaw = m[2].trim();
  if (!TOOLS[name]) return { name: null, error: `Unknown tool '${name}'`, raw: m[0] };
  try {
    const args = JSON.parse(argsRaw);
    return { name, args, raw: m[0] };
  } catch (e) {
    return { name, error: `Invalid JSON args: ${e.message}`, raw: m[0] };
  }
}

/**
 * Run the agent loop.
 * @param {string} task
 * @param {object} opts
 * @param {boolean} [opts.yolo]      skip confirmations
 * @param {number}  [opts.maxSteps]  default 20
 * @param {string}  [opts.model]     override active model
 * @returns {Promise<{steps: number, summary: string, history: Array}>}
 */
export async function runAgent(task, opts = {}) {
  const maxSteps = opts.maxSteps || 20;
  const yolo = !!opts.yolo;

  const history = [
    { role: "user", content: SYSTEM_PROMPT(task) },
  ];

  let steps = 0;
  let summary = "";

  ui.title("devbuddy agent");
  ui.muted(`task: ${task}`);
  ui.muted(`mode: ${yolo ? "yolo (no confirms)" : "confirm-on-mutate"}`);
  ui.muted(`max-steps: ${maxSteps}`);
  ui.blank();

  while (steps < maxSteps) {
    steps++;
    ui.heading(`step ${steps}/${maxSteps}`);

    // Send history, get next assistant message
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

    // Did the model call a tool?
    const call = parseToolCall(assistantText);

    if (!call) {
      // No tool call. If there's any other text, show it as a thinking note
      // and prompt the model to either call a tool or finish.
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

    if (call.error) {
      ui.warn(`parse error: ${call.error}`);
      history.push({
        role: "user",
        content: `Your last tool call had an error: ${call.error}. Try again.`,
      });
      continue;
    }

    // Execute the tool
    ui.kv("tool", call.name);
    let result;
    try {
      result = await executeTool(call.name, call.args, { yolo });
    } catch (e) {
      result = `ERROR: ${e.message}`;
      ui.error(`  tool failed: ${e.message}`);
    }

    // Truncate huge tool results to keep history manageable
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    const trimmed = resultStr.length > 4000
      ? resultStr.slice(0, 4000) + `\n... (truncated, ${resultStr.length - 4000} more chars)`
      : resultStr;

    if (resultStr && resultStr !== "(skipped by user)") {
      const preview = resultStr.split("\n").slice(0, 4).join("\n").slice(0, 300);
      ui.muted(`  → ${preview}${resultStr.length > 300 ? "…" : ""}`);
    }

    history.push({
      role: "user",
      content: `Tool ${call.name} result:\n${trimmed}\n\nContinue. Call the next tool, or call finish.`,
    });

    // Did the model finish?
    if (call.name === "finish") {
      summary = call.args.summary || "(no summary)";
      ui.blank();
      ui.ok("agent finished.");
      break;
    }
  }

  if (steps >= maxSteps && !summary) {
    summary = `(stopped at max-steps=${maxSteps})`;
    ui.warn(`hit max-steps (${maxSteps}). stopping.`);
  }

  ui.blank();
  ui.heading("summary");
  ui.body(summary || "(no summary)");

  return { steps, summary, history };
}
