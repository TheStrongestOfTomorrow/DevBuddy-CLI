// `devbuddy chat` — interactive multi-message chat with persistence.
//
// Subcommands:
//   devbuddy chat                          # start new global chat (REPL)
//   devbuddy chat --project                # start new project-scoped chat
//   devbuddy chat --continue               # resume most recent chat
//   devbuddy chat --chat <id>              # resume a specific chat
//   devbuddy chat list [--scope all|global|project]
//   devbuddy chat show <id>
//   devbuddy chat branch <id>
//   devbuddy chat export <id>
//   devbuddy chat rm <id>
//
// In-REPL slash commands:
//   /help              show available commands
//   /exit (or /quit)   save and exit
//   /clear             clear screen
//   /save              save current chat (auto-saved anyway)
//   /summary           ask AI for a 1-paragraph summary of the chat so far
//   /model <name>      switch model for subsequent turns
//   /system <text>     set/override system prompt
//   /branch            branch the chat at the current point
//   /title <text>      rename the chat
//   /history           show message count + tokens estimate
//   /context           show DEVBUDDY.md path being used (if any)

import { createChat, getChat, saveChat, appendMessage, listChats, deleteChat, branchChat, exportChatAsMarkdown } from "../chat/store.js";
import { complete, isOnboarded, isAuthenticated, getActiveProvider, getActiveModel, warnRateLimit } from "../ai/providers.js";
import { loadDevbuddyMd, findDevbuddyMd, systemPromptSuffix } from "../prompt.js";
import { loadConfig, saveConfig } from "../store.js";
import { writeFileSync } from "node:fs";
import * as ui from "../ui.js";

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

// --- Minimal stdin line reader (no deps) ---

function readline(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf.replace(/\r?\n$/, ""));
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

function estimateTokens(messages) {
  // ~4 chars per token, rough estimate
  const chars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  return Math.ceil(chars / 4);
}

function renderHelp() {
  ui.blank();
  ui.heading("slash commands");
  ui.bullet("/help                show this help");
  ui.bullet("/exit, /quit         save and exit");
  ui.bullet("/clear               clear screen");
  ui.bullet("/save                force-save current chat");
  ui.bullet("/summary             ask AI for a 1-paragraph summary of chat so far");
  ui.bullet("/model <name>        switch model for subsequent turns");
  ui.bullet("/system <text>       set/override system prompt (or '/system clear' to reset)");
  ui.bullet("/branch              branch the chat at the current point");
  ui.bullet("/title <text>        rename the chat");
  ui.bullet("/history             show message count + tokens estimate");
  ui.bullet("/context             show DEVBUDDY.md path being used");
  ui.blank();
}

// --- Main REPL loop ---

async function runRepl({ chat, opts }) {
  const cfg = loadConfig();
  let systemOverride = opts.system || null;
  let modelOverride = opts.model || chat.model || getActiveModel();
  const devbuddyMd = findDevbuddyMd();

  warnRateLimit();

  ui.blank();
  ui.title(`devbuddy chat — ${chat.title}`);
  ui.muted(`id: ${chat.id}  |  scope: ${chat.scope}  |  model: ${modelOverride}`);
  if (devbuddyMd) {
    ui.muted(`context: ${devbuddyMd.path}`);
  }
  ui.muted(`type /help for commands, /exit to quit`);
  ui.blank();

  // Replay history if resuming
  if (chat.messages.length > 0) {
    ui.muted(`(resuming — ${chat.messages.length} messages)`);
    for (const m of chat.messages) {
      const label = m.role === "user" ? ui.theme.accent("you") : ui.theme.value("ai");
      console.log(`  ${label} ${ui.theme.muted("·")} ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`);
    }
    ui.blank();
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await readline(ui.theme.accent("> ") + ui.theme.muted(""));
    const trimmed = input.trim();

    if (trimmed === "") continue;

    // --- Slash commands ---
    if (trimmed.startsWith("/")) {
      const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
      const argStr = trimmed.slice(1 + cmd.length).trim();

      switch (cmd.toLowerCase()) {
        case "exit":
        case "quit":
          saveChat(chat);
          ui.ok("chat saved. bye.");
          return;

        case "help":
          renderHelp();
          continue;

        case "clear":
          console.clear();
          continue;

        case "save":
          saveChat(chat);
          ui.ok(`saved (${chat.messages.length} messages).`);
          continue;

        case "summary": {
          if (chat.messages.length === 0) {
            ui.warn("chat is empty.");
            continue;
          }
          ui.muted("asking AI for a summary…");
          const convo = chat.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
          const sys = "Summarize the following conversation in one paragraph. Be concise." + systemPromptSuffix();
          try {
            const sum = await complete(convo, { system: sys, model: modelOverride, maxTokens: 300 });
            ui.blank();
            ui.body(sum);
            ui.blank();
          } catch (e) {
            ui.error(e.message);
          }
          continue;
        }

        case "model":
          if (!argStr) {
            ui.muted(`current model: ${modelOverride}`);
            continue;
          }
          modelOverride = argStr;
          chat.model = argStr;
          saveChat(chat);
          ui.ok(`model switched to: ${argStr}`);
          continue;

        case "system":
          if (!argStr || argStr === "clear") {
            systemOverride = null;
            ui.ok("system prompt cleared (will use defaults).");
          } else {
            systemOverride = argStr;
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
          ui.muted(`messages: ${chat.messages.length}  |  est. tokens: ~${tokens}`);
          continue;
        }

        case "context": {
          const f = findDevbuddyMd();
          if (f) ui.muted(`using: ${f.path} (${f.source})`);
          else ui.muted("no DEVBUDDY.md found in CWD or ~/.devbuddy/.");
          continue;
        }

        default:
          ui.warn(`unknown command: /${cmd}. type /help.`);
          continue;
      }
    }

    // --- Regular message ---
    appendMessage(chat, "user", trimmed);

    // Build system prompt
    const baseSystem = systemOverride ||
      `You are a helpful, concise developer assistant. Answer in ${cfg.language}. ` +
      `Use code blocks when useful.` + systemPromptSuffix();

    // Build messages array (cap history to last 20 to stay under token limits)
    const history = chat.messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const spinner = new ui.Spinner("thinking");
    spinner.start();

    try {
      const reply = await complete(null, {
        messages: [
          { role: "system", content: baseSystem },
          ...history,
        ],
        model: modelOverride,
        maxTokens: 1024,
      });
      spinner.stop();

      appendMessage(chat, "assistant", reply);
      ui.blank();
      console.log(`  ${ui.theme.value("ai")} ${ui.theme.muted("·")} ${reply}`);
      ui.blank();
    } catch (e) {
      spinner.fail();
      ui.error(e?.message || String(e));
      // Roll back the user message we just appended so the chat doesn't have
      // a dangling user turn with no reply.
      chat.messages.pop();
      saveChat(chat);
    }
  }
}

// --- Command registration ---

export function register(program) {
  const chat = program.command("chat").description("Multi-message chat with AI. Saved to disk.");

  // Default: start a new chat (or resume with flags)
  chat
    .option("--project", "Scope the chat to the current directory (saved to ./.devbuddy/chats/).")
    .option("-c, --continue", "Resume the most recent chat.")
    .option("--chat <id>", "Resume a specific chat by ID.")
    .option("-m, --model <name>", "Override the model for this chat.")
    .option("-s, --system <prompt>", "Set a system prompt for this chat.")
    .action(async (opts) => {
      requireOnboarding();

      let target;
      if (opts.continue) {
        const list = listChats({ scope: opts.project ? "project" : "all" });
        if (list.length === 0) {
          ui.warn("no saved chats to continue. starting a new one.");
          target = createChat({ scope: opts.project ? "project" : "global" });
        } else {
          const found = getChat(list[0].id);
          target = found || createChat({ scope: opts.project ? "project" : "global" });
        }
      } else if (opts.chat) {
        const found = getChat(opts.chat);
        if (!found) {
          ui.error(`chat not found: ${opts.chat}`);
          ui.muted("list chats with: devbuddy chat list");
          process.exit(1);
        }
        target = found;
      } else {
        target = createChat({ scope: opts.project ? "project" : "global" });
      }

      await runRepl({ chat: target, opts });
    });

  chat
    .command("list")
    .description("List saved chats.")
    .option("--scope <scope>", "all | global | project", "all")
    .action((opts) => {
      const list = listChats({ scope: opts.scope });
      if (list.length === 0) {
        ui.muted("(no saved chats)");
        ui.muted("  start one with: devbuddy chat");
        return;
      }
      ui.title("saved chats");
      ui.blank();
      for (const c of list) {
        const scope = c.scope === "project" ? ui.theme.warn("[proj]") : ui.theme.muted("[globe]");
        const date = new Date(c.updatedAt).toLocaleString();
        const preview = c.preview ? c.preview.replace(/\n/g, " ").slice(0, 60) : "(empty)";
        console.log(`  ${scope} ${ui.theme.value(c.id)} ${ui.theme.muted("·")} ${c.title}`);
        console.log(`       ${ui.theme.muted(date + "  ·  " + c.messageCount + " msgs  ·  " + preview)}`);
      }
      ui.blank();
      ui.muted("resume: devbuddy chat --chat <id>    |    show: devbuddy chat show <id>");
    });

  chat
    .command("show <id>")
    .description("Show the full message history of a chat.")
    .action((id) => {
      const c = getChat(id);
      if (!c) { ui.error(`chat not found: ${id}`); process.exit(1); }
      ui.title(c.title);
      ui.muted(`id: ${c.id}  |  scope: ${c.scope}  |  model: ${c.model}  |  msgs: ${c.messages.length}`);
      ui.blank();
      for (const m of c.messages) {
        const label = m.role === "user" ? ui.theme.accent("you") : ui.theme.value("ai");
        console.log(`  ${label} ${ui.theme.muted("·")} ${m.ts || ""}`);
        console.log(`    ${m.content}`);
        ui.blank();
      }
    });

  chat
    .command("branch <id>")
    .description("Create a copy of a chat to explore a different direction.")
    .action((id) => {
      const b = branchChat(id);
      if (!b) { ui.error(`chat not found: ${id}`); process.exit(1); }
      ui.ok(`branched → ${b.id}`);
      ui.muted(`resume with: devbuddy chat --chat ${b.id}`);
    });

  chat
    .command("export <id>")
    .description("Export a chat as Markdown.")
    .option("-o, --output <file>", "Write to a file (default: stdout).")
    .action((id, opts) => {
      const result = exportChatAsMarkdown(id);
      if (!result) { ui.error(`chat not found: ${id}`); process.exit(1); }
      if (opts.output) {
        writeFileSync(opts.output, result.markdown);
        ui.ok(`exported to: ${opts.output}`);
      } else {
        console.log(result.markdown);
      }
    });

  chat
    .command("rm <id>")
    .description("Delete a chat.")
    .action((id) => {
      const ok = deleteChat(id);
      if (!ok) { ui.error(`chat not found: ${id}`); process.exit(1); }
      ui.ok(`deleted: ${id}`);
    });
}
