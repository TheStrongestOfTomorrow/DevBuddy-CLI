// Unified REPL: chat + agent modes in one session.
//
// Launched by `devbuddy` (no subcommand). User can toggle between modes:
//   /agent [--yolo]   → switch to agent mode (optional --yolo to skip confirms)
//   /chat             → switch back to chat mode
//   /provider <id>    → switch provider on-the-fly
//   /switch-provider  → pick or switch provider with model selection
//   /key <name>       → switch named API key
//   /compact          → compress chat context with AI summary & preserve files/state

import { createChat, getChat, saveChat, appendMessage, listChats, deleteChat, branchChat, exportChatAsMarkdown } from "../chat/store.js";
import { complete, completeStream, isOnboarded, isAuthenticated, getActiveProvider, getActiveModel, warnRateLimit, PROVIDERS, PROVIDER_IDS, getActiveProviderId, fetchProviderModels } from "../ai/providers.js";
import { loadDevbuddyMd, findDevbuddyMd, systemPromptSuffix } from "../prompt.js";
import { loadConfig, saveConfig, setActiveProvider, setProviderModel, getNamedKeys, selectNamedKey } from "../store.js";
import { writeFileSync, existsSync } from "node:fs";
import { readlineWithSuggest, SLASH_COMMANDS as BASE_SLASH_COMMANDS } from "../ui/suggest.js";
import { runAgent } from "../agent/core.js";
import * as ui from "../ui.js";

export const SLASH_COMMANDS = [
  ...BASE_SLASH_COMMANDS,
  { cmd: "/agent",           desc: "switch to agent mode (optional: --yolo)" },
  { cmd: "/chat",            desc: "switch to chat mode" },
  { cmd: "/mode",            desc: "show current mode" },
  { cmd: "/provider",        desc: "switch AI provider (/provider <id>)" },
  { cmd: "/switch-provider", desc: "interactive provider & model switch" },
  { cmd: "/key",             desc: "switch active named API key (/key <name>)" },
  { cmd: "/compact",         desc: "compress context window with AI summary" },
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

function renderWelcome(chat, { model, devbuddyMd, cfg, mode, yolo, thinking }) {
  ui.blank();
  ui.title("╭─ devbuddy ────────────────────────────");
  ui.muted(`│`);
  ui.muted(`│  chat:   ${chat.title}`);
  ui.muted(`│  id:     ${chat.id}`);
  ui.muted(`│  scope:  ${chat.scope}${chat.scopePath ? ` (${chat.scopePath})` : ""}`);
  ui.muted(`│  model:  ${model}`);
  ui.muted(`│  prov:   ${cfg.provider || "(none)"}`);
  if (cfg.activeKeyName) {
    ui.muted(`│  key:    ${cfg.activeKeyName}`);
  }
  ui.muted(`│  mode:   ${mode === "agent" ? ui.theme.warn("AGENT" + (yolo ? " (yolo)" : "")) : "chat"}${thinking ? ui.theme.accent(" + thinking") : ""}`);
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
    console.log(`  ${mark} ${ui.theme.value(c.cmd.padEnd(18))} ${ui.theme.muted(c.desc)}`);
  }
  ui.blank();
  ui.muted(`current mode: ${mode}`);
  ui.blank();
}

function parseSlash(input) {
  if (!input.startsWith("/")) return null;
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const argStr = input.slice(1 + cmd.length).trim();
  return { cmd: cmd.toLowerCase(), argStr, rest };
}

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

  appendMessage(chat, "user", `[agent task] ${task}`);
  appendMessage(chat, "assistant", `[agent result, ${result.steps} steps]\n${result.summary || "(no summary)"}`);

  ui.blank();
  ui.ok(`agent done (${result.steps} steps).`);
  ui.blank();
  return result;
}

// Perform AI context compaction
async function performCompaction(chat, { modelOverride, cfg }) {
  if (chat.messages.length < 2) {
    ui.warn("Not enough conversation history to compact.");
    return;
  }

  ui.muted("Compacting conversation history using AI summary...");
  const rawConvo = chat.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const compPrompt = "Summarize the key facts, tasks, decisions, code edits, and state of this developer conversation concise and structured." + systemPromptSuffix();

  try {
    const summary = await complete(rawConvo, {
      system: compPrompt,
      model: modelOverride,
      maxTokens: 500,
    });

    // Backup current full messages to a archive array in chat JSON
    if (!chat.uncompressedHistory) chat.uncompressedHistory = [];
    chat.uncompressedHistory.push(...chat.messages);

    // Rebuild working context with structured boundary marker
    const compactedMessage = {
      role: "assistant",
      content: `[COMPACTED CONTEXT SUMMARY]\n${summary}\n\n[Working session continued with lightweight summary]`
    };

    chat.messages = [compactedMessage];
    saveChat(chat);

    ui.ok("Context compacted successfully!");
    ui.muted(`  Summary tokens: ~${Math.ceil(summary.length / 4)}`);
    ui.muted("  Full uncompressed history archived to local chat record.");
  } catch (e) {
    ui.error(`Compaction failed: ${e.message}`);
  }
}

// --- Main unified REPL loop ---

export async function runUnifiedRepl({ chat: initialChat, opts = {} }) {
  const cfg = loadConfig();
  let mode = opts.mode || "chat";        // 'chat' | 'agent'
  let yolo = !!opts.yolo;
  let thinking = false;                   // thinking mode (step-by-step reasoning)
  let modelOverride = opts.model || initialChat.model || getActiveModel();
  let allow = opts.allow || [];
  const devbuddyMd = findDevbuddyMd();

  warnRateLimit();

  let chat = initialChat;
  renderWelcome(chat, { model: modelOverride, devbuddyMd, cfg, mode, yolo, thinking });

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

    if (trimmed.startsWith("/")) {
      const { cmd, argStr, rest } = parseSlash(trimmed);

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
          renderWelcome(chat, { model: modelOverride, devbuddyMd, cfg, mode, yolo, thinking });
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

        case "compact":
          await performCompaction(chat, { modelOverride, cfg });
          continue;

        case "provider":
        case "switch-provider": {
          const provId = rest[0];
          if (provId) {
            if (!PROVIDERS[provId]) {
              ui.error(`Unknown provider '${provId}'. Available: ${PROVIDER_IDS.join(", ")}`);
              continue;
            }
            setActiveProvider(provId);
            const p = PROVIDERS[provId];
            modelOverride = p.defaultModel;
            chat.model = modelOverride;
            saveChat(chat);
            ui.ok(`Switched to provider '${p.name}' (${provId}). Model set to: ${modelOverride}`);
          } else {
            ui.heading("Available Providers");
            for (const id of PROVIDER_IDS) {
              const p = PROVIDERS[id];
              const mark = id === getActiveProviderId() ? ui.theme.ok("→") : " ";
              console.log(`  ${mark} ${ui.theme.value(id.padEnd(14))} ${p.name}`);
            }
            ui.muted("Usage: /provider <id>  (e.g. /provider openai)");
          }
          continue;
        }

        case "key": {
          if (!argStr) {
            const keys = getNamedKeys();
            ui.heading("Named API Keys");
            for (const [kName, kObj] of Object.entries(keys)) {
              const mark = kName === cfg.activeKeyName ? ui.theme.ok("→") : " ";
              console.log(`  ${mark} ${ui.theme.value(kName.padEnd(16))} [${kObj.provider || "any"}]`);
            }
            ui.muted("Usage: /key <name>  (or /key clear to unselect)");
            continue;
          }
          if (argStr === "clear") {
            selectNamedKey(null);
            ui.ok("Active named key cleared.");
          } else {
            try {
              selectNamedKey(argStr);
              ui.ok(`Active named key set to '${argStr}'.`);
            } catch (e) {
              ui.error(e.message);
            }
          }
          continue;
        }

        case "agent": {
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
          ui.muted(`current mode: ${mode}${mode === "agent" && yolo ? " (yolo)" : ""}${thinking ? " (thinking)" : ""}`);
          continue;

        case "thinking":
          thinking = !thinking;
          if (thinking) {
            ui.ok("thinking mode ON — AI will reason step-by-step before answering.");
            ui.muted("  (toggle off with /thinking again)");
          } else {
            ui.ok("thinking mode OFF — direct answers.");
          }
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

        case "model": {
          let manual = false;
          let targetModel = argStr;
          if (argStr.startsWith("--manual")) {
            manual = true;
            targetModel = argStr.replace("--manual", "").trim();
          }
          if (!targetModel) {
            ui.muted(`current model: ${modelOverride}`);
            ui.muted("  (pass model ID or use `--manual <id>`)");
            continue;
          }
          modelOverride = targetModel;
          chat.model = targetModel;
          saveChat(chat);
          ui.ok(`model switched to: ${targetModel}${manual ? " (manual override)" : ""}`);
          continue;
        }

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

    if (mode === "agent") {
      await runAgentInline(trimmed, { yolo, model: modelOverride, allow, cfg, chat, phone: opts.phone });
      history.push(trimmed);
      continue;
    }

    appendMessage(chat, "user", trimmed);
    history.push(trimmed);

    const baseSystem = opts.system ||
      `You are a helpful, concise developer assistant. Answer in ${cfg.language}. ` +
      `Use code blocks when useful.` +
      (thinking ? ` Think step-by-step before answering. Show your reasoning, then give the final answer.` : "") +
      systemPromptSuffix();

    const convo = chat.messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const spinner = new ui.Spinner("thinking");
    spinner.start();

    try {
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

export async function launchUnified(opts = {}) {
  requireOnboarding();

  if (opts.phone) {
    const phoneCfg = loadConfig();
    if (!phoneCfg.phoneControlEnabled || !phoneCfg.phoneControlTrusted) {
      ui.error(
        "Phone control is not enabled.\n" +
        "  Enable it first (requires Ollama + type-to-confirm trust):\n" +
        "  devbuddy phone enable\n\n" +
        "  Phone control lets the AI control your Android phone, so it stays OFF\n" +
        "  until you explicitly enable and trust it. Status: devbuddy phone status"
      );
      process.exit(1);
    }
  }

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

  if (opts.agent) {
    opts.mode = "agent";
  }

  await runUnifiedRepl({ chat, opts });
}
