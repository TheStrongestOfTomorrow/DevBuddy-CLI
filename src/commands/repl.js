// Unified REPL: chat + agent modes in one session.
//
// Launched by `devbuddy` (no subcommand). User can toggle between modes:
//   /agent [--yolo]   → switch to agent mode (optional --yolo to skip confirms)
//   /chat             → switch back to chat mode
//
// In chat mode, user messages go to the AI as conversation turns.
// In agent mode, user messages become agent tasks (run via runAgent inline).
//
// Both modes share the same persistent chat record, so you can chat about
// something, then say /agent "now go implement that" and the agent runs.

import { createChat, getChat, saveChat, appendMessage, listChats, deleteChat, branchChat, exportChatAsMarkdown } from "../chat/store.js";
import { complete, completeStream, isOnboarded, isAuthenticated, getActiveProvider, getActiveModel, warnRateLimit, PROVIDERS, PROVIDER_IDS, getActiveProviderId } from "../ai/providers.js";
import { loadDevbuddyMd, findDevbuddyMd, systemPromptSuffix } from "../prompt.js";
import { loadConfig, saveConfig } from "../store.js";
import { writeFileSync } from "node:fs";
import { readlineWithSuggest, SLASH_COMMANDS as BASE_SLASH_COMMANDS } from "../ui/suggest.js";
import { runAgent } from "../agent/core.js";
import * as ui from "../ui.js";

// Add the mode-switching slash commands to the suggest list.
export const SLASH_COMMANDS = [
  ...BASE_SLASH_COMMANDS,
  { cmd: "/agent",  desc: "switch to agent mode (optional: --yolo)" },
  { cmd: "/chat",   desc: "switch to chat mode" },
  { cmd: "/mode",   desc: "show current mode" },
];

function requireOnboarding() {
  if (!isOnboarded()) {
    ui.error("DevBuddy is not onboarded yet.\n  Run: devbuddy onboard");
    process.exit(1);
  }
  if (!isAuthenticated()) {
    const p = getActiveProvider();
    ui.error(`No API key set for ${p.name}. Re-run: devbuddy onboard --force`);
    process.exit(1);
  }
}

function requireAgentEnabled() {
  const cfg = loadConfig();
  if (!cfg.agentEnabled) {
    ui.warn(
      "Agent mode is currently OFF in config.\n" +
      "  Enable with: devbuddy agent toggle\n" +
      "  (or)         devbuddy config set agentEnabled true\n" +
      "  Proceeding anyway for this session."
    );
  }
}

function estimateTokens(messages) {
  const chars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  return Math.ceil(chars / 4);
}

function renderWelcome(chat, { model, devbuddyMd, cfg, mode, yolo }) {
  ui.blank();
  ui.title("╭─ devbuddy ────────────────────────────");
  ui.muted(`│`);
  ui.muted(`│  chat:   ${chat.title}`);
  ui.muted(`│  id:     ${chat.id}`);
  ui.muted(`│  scope:  ${chat.scope}${chat.scopePath ? ` (${chat.scopePath})` : ""}`);
  ui.muted(`│  model:  ${model}`);
  ui.muted(`│  prov:   ${cfg.provider || "(none)"}`);
  ui.muted(`│  mode:   ${mode === "agent" ? ui.theme.warn("AGENT" + (yolo ? " (yolo)" : "")) : "chat"}`);
  if (devbuddyMd) {
    ui.muted(`│  ctx:    ${devbuddyMd.path}`);
  }
  ui.muted(`│`);
  ui.muted(`│  type your message. Tab/→ to accept suggestion.`);
  ui.muted(`│  /agent to switch to agent mode, /chat to switch back, /help for all.`);
  ui.muted("╰────────────────────────────────────────");
  ui.blank();
}

function renderHelp(mode) {
  ui.blank();
  ui.heading("slash commands");
  for (const c of SLASH_COMMANDS) {
    const active = (c.cmd === "/agent" && mode === "agent") || (c.cmd === "/chat" && mode === "chat");
    const mark = active ? ui.theme.ok("→") : " ";
    console.log(`  ${mark} ${ui.theme.value(c.cmd.padEnd(12))} ${ui.theme.muted(c.desc)}`);
  }
  ui.blank();
  ui.muted(`current mode: ${mode}`);
  ui.blank();
}

// Parse a slash-command line into { cmd, argStr, raw }.
function parseSlash(input) {
  if (!input.startsWith("/")) return null;
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const argStr = input.slice(1 + cmd.length).trim();
  return { cmd: cmd.toLowerCase(), argStr, rest };
}

// Run an agent task inline (within the unified REPL).
// The agent's summary becomes the assistant message in the chat record.
async function runAgentInline(task, { yolo, model, allow, cfg, chat, phone }) {
  ui.blank();
  ui.heading(`agent task`);
  ui.muted(`task: ${task}`);
  if (yolo) ui.muted(`mode: yolo (no confirms)`);
  if (phone) ui.warn(`⚠️ phone control active — agent can control your phone`);
  ui.blank();

  let result;
  try {
    result = await runAgent(task, {
      yolo: yolo || cfg.agentYolo,
      maxSteps: cfg.agentMaxSteps || 20,
      model,
      allow: allow || [],
      phone: phone || false,
    });
  } catch (e) {
    result = { steps: 0, summary: `(agent failed: ${e.message})`, history: [] };
    ui.error(e?.message || String(e));
  }

  // Record the agent run as a special message in the chat.
  appendMessage(chat, "user", `[agent task] ${task}`);
  appendMessage(chat, "assistant", `[agent result, ${result.steps} steps]\n${result.summary || "(no summary)"}`);

  ui.blank();
  ui.ok(`agent done (${result.steps} steps).`);
  ui.blank();
  return result;
}

// --- Main unified REPL loop ---

export async function runUnifiedRepl({ chat: initialChat, opts = {} }) {
  const cfg = loadConfig();
  let mode = opts.mode || "chat";        // 'chat' | 'agent'
  let yolo = !!opts.yolo;
  let modelOverride = opts.model || initialChat.model || getActiveModel();
  let allow = opts.allow || [];
  const devbuddyMd = findDevbuddyMd();

  warnRateLimit();

  let chat = initialChat;
  renderWelcome(chat, { model: modelOverride, devbuddyMd, cfg, mode, yolo });

  // Replay history if resuming
  if (chat.messages.length > 0) {
    ui.muted(`(resuming — ${chat.messages.length} messages)`);
    for (const m of chat.messages) {
      const label = m.role === "user" ? ui.theme.accent("you") : ui.theme.value("ai");
      console.log(`  ${label} ${ui.theme.muted("·")} ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`);
    }
    ui.blank();
  }

  const history = chat.messages.filter((m) => m.role === "user").map((m) => m.content);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const promptPrefix = mode === "agent"
      ? `${ui.theme.warn("[agent]")} ${ui.theme.accent("> ")}`
      : ui.theme.accent("> ");
    const input = await readlineWithSuggest(promptPrefix + ui.theme.muted(""), history);
    if (input === null) {
      saveChat(chat);
      ui.ok("chat saved. bye.");
      return;
    }
    const trimmed = input.trim();
    if (trimmed === "") continue;

    // --- Slash commands ---
    if (trimmed.startsWith("/")) {
      const { cmd, argStr } = parseSlash(trimmed);

      switch (cmd) {
        case "exit":
        case "quit":
          saveChat(chat);
          ui.ok("chat saved. bye.");
          return;

        case "help":
          renderHelp(mode);
          continue;

        case "clear":
          console.clear();
          renderWelcome(chat, { model: modelOverride, devbuddyMd, cfg, mode, yolo });
          continue;

        case "save":
          saveChat(chat);
          ui.ok(`saved (${chat.messages.length} messages).`);
          continue;

        case "reset":
          chat.messages = [];
          saveChat(chat);
          ui.ok("conversation history cleared (chat kept).");
          continue;

        case "agent": {
          // /agent [--yolo] [--allow <dir>]
          const parts = (argStr || "").split(/\s+/).filter(Boolean);
          const newArgs = { yolo, allow: [...allow] };
          for (let i = 0; i < parts.length; i++) {
            if (parts[i] === "--yolo" || parts[i] === "yolo") newArgs.yolo = true;
            else if (parts[i] === "--allow" && parts[i + 1]) { newArgs.allow.push(parts[++i]); }
            else if (parts[i] === "--safe") newArgs.yolo = false;
          }
          yolo = newArgs.yolo;
          allow = newArgs.allow;
          mode = "agent";
          requireAgentEnabled();
          ui.ok(`switched to AGENT mode${yolo ? ui.theme.warn(" (yolo — no confirms)") : ""}.`);
          if (allow.length > 0) {
            ui.muted(`extra allowed roots:`);
            for (const r of allow) ui.muted(`  - ${r}`);
          }
          ui.muted(`your messages will now run as agent tasks.`);
          ui.muted(`/chat to switch back. /help for all commands.`);
          ui.blank();
          continue;
        }

        case "chat":
          mode = "chat";
          ui.ok(`switched to CHAT mode.`);
          ui.muted(`your messages will now go to the AI as conversation turns.`);
          ui.muted(`/agent to switch back. /help for all commands.`);
          ui.blank();
          continue;

        case "mode":
          ui.muted(`current mode: ${mode}${mode === "agent" && yolo ? " (yolo)" : ""}`);
          continue;

        case "summary": {
          if (chat.messages.length === 0) { ui.warn("chat is empty."); continue; }
          ui.muted("asking AI for a summary…");
          const convo = chat.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
          const sys = "Summarize the following conversation in one paragraph. Be concise." + systemPromptSuffix();
          try {
            const sum = await complete(convo, { system: sys, model: modelOverride, maxTokens: 300 });
            ui.blank();
            ui.body(sum);
            ui.blank();
          } catch (e) { ui.error(e.message); }
          continue;
        }

        case "model":
          if (!argStr) { ui.muted(`current model: ${modelOverride}`); continue; }
          modelOverride = argStr;
          chat.model = argStr;
          saveChat(chat);
          ui.ok(`model switched to: ${argStr}`);
          continue;

        case "system":
          if (!argStr || argStr === "clear") {
            opts.system = null;
            ui.ok("system prompt cleared (will use defaults).");
          } else {
            opts.system = argStr;
            ui.ok("system prompt set for subsequent turns.");
          }
          continue;

        case "branch": {
          const b = branchChat(chat.id, { cwd: chat.scopePath });
          if (!b) { ui.error("could not branch."); continue; }
          ui.ok(`branched → new chat id: ${b.id}`);
          ui.muted("run `devbuddy chat --chat " + b.id + "` to switch to it.");
          continue;
        }

        case "title":
          if (!argStr) { ui.muted(`current title: ${chat.title}`); continue; }
          chat.title = argStr;
          saveChat(chat);
          ui.ok(`renamed to: ${argStr}`);
          continue;

        case "history": {
          const tokens = estimateTokens(chat.messages);
          ui.muted(`messages: ${chat.messages.length}  |  est. tokens: ~${tokens}  |  mode: ${mode}`);
          continue;
        }

        case "cost": {
          const tokens = estimateTokens(chat.messages);
          ui.muted(`est. tokens: ~${tokens}  |  est. cost: $${(tokens * 0.000005).toFixed(4)} (rough)  |  mode: ${mode}`);
          continue;
        }

        case "context": {
          const f = findDevbuddyMd();
          if (f) ui.muted(`using: ${f.path} (${f.source})`);
          else ui.muted("no DEVBUDDY.md found in CWD or ~/.devbuddy/.");
          continue;
        }

        case "agents": {
          ui.heading("available sub-agent models");
          const activeId = getActiveProviderId();
          for (const id of PROVIDER_IDS) {
            const p = PROVIDERS[id];
            const hasKey = cfg.providers?.[id]?.apiKey;
            const mark = id === activeId ? ui.theme.ok("→") : " ";
            const key = hasKey ? ui.theme.ok("✓") : ui.theme.muted("·");
            const tag = p.free ? ui.theme.ok("(free)") : ui.theme.muted("(paid)");
            console.log(`  ${mark} ${key} ${id.padEnd(12)} ${tag} ${p.name}`);
            ui.muted(`        models: ${p.models.slice(0, 3).join(", ")}${p.models.length > 3 ? "…" : ""}`);
          }
          ui.blank();
          continue;
        }

        default:
          ui.warn(`unknown command: /${cmd}. type /help.`);
          continue;
      }
    }

    // --- Regular message ---
    if (mode === "agent") {
      // Run as agent task
      await runAgentInline(trimmed, { yolo, model: modelOverride, allow, cfg, chat, phone: opts.phone });
      history.push(trimmed);
      continue;
    }

    // Chat mode: standard conversation turn
    appendMessage(chat, "user", trimmed);
    history.push(trimmed);

    const baseSystem = opts.system ||
      `You are a helpful, concise developer assistant. Answer in ${cfg.language}. ` +
      `Use code blocks when useful.` + systemPromptSuffix();

    const convo = chat.messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const spinner = new ui.Spinner("thinking");
    spinner.start();

    try {
      // Stream the response token-by-token
      ui.blank();
      process.stdout.write(`  ${ui.theme.value("ai")} ${ui.theme.muted("·")} `);
      const reply = await completeStream(null, {
        messages: [
          { role: "system", content: baseSystem },
          ...convo,
        ],
        model: modelOverride,
        maxTokens: 1024,
        onToken: (chunk) => process.stdout.write(chunk),
      });
      spinner.stop();
      ui.blank(); ui.blank();

      appendMessage(chat, "assistant", reply);
    } catch (e) {
      spinner.fail();
      ui.error(e?.message || String(e));
      chat.messages.pop();
      saveChat(chat);
    }
  }
}

// --- Entry point used by `devbuddy` (no subcommand) ---

export async function launchUnified(opts = {}) {
  requireOnboarding();

  let chat;
  if (opts.continue) {
    const list = listChats({ scope: opts.project ? "project" : "all" });
    if (list.length === 0) {
      chat = createChat({ scope: opts.project ? "project" : "global" });
    } else {
      chat = getChat(list[0].id) || createChat({ scope: opts.project ? "project" : "global" });
    }
  } else if (opts.chat) {
    chat = getChat(opts.chat);
    if (!chat) {
      ui.error(`chat not found: ${opts.chat}`);
      ui.muted("list chats with: devbuddy chat list");
      process.exit(1);
    }
  } else {
    chat = createChat({ scope: opts.project ? "project" : "global" });
  }

  // If user passed --agent, start in agent mode
  if (opts.agent) {
    opts.mode = "agent";
  }

  await runUnifiedRepl({ chat, opts });
}
