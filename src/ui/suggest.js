// Inline fuzzy auto-suggest input line reader.
//
// Inspired by fish shell's autosuggest + Gemini CLI's command palette.
// As the user types, we show a dim suggestion above/beside the prompt.
// Press Tab or Right-Arrow to accept.
//
// Suggestions come from:
//   1. Slash commands (when input starts with /)
//   2. Filenames (when input looks like a path)
//   3. Chat history (most-recent-first prefix match)

import { readdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";

// --- Suggestion sources ---

export const SLASH_COMMANDS = [
  { cmd: "/help",    desc: "show available commands" },
  { cmd: "/exit",    desc: "save and exit" },
  { cmd: "/quit",    desc: "save and exit" },
  { cmd: "/clear",   desc: "clear screen" },
  { cmd: "/save",    desc: "force-save current chat" },
  { cmd: "/summary", desc: "AI summarizes the chat so far" },
  { cmd: "/model",   desc: "switch model for subsequent turns" },
  { cmd: "/system",  desc: "set/override system prompt" },
  { cmd: "/branch",  desc: "branch the chat at current point" },
  { cmd: "/title",   desc: "rename the chat" },
  { cmd: "/history", desc: "message count + tokens estimate" },
  { cmd: "/context", desc: "show DEVBUDDY.md path" },
  { cmd: "/reset",   desc: "clear conversation history (keeps chat)" },
  { cmd: "/agents",  desc: "list available sub-agent models" },
  { cmd: "/cost",    desc: "estimate tokens used so far" },
];

function fileCompletions(partial) {
  if (!partial.includes("/")) {
    try {
      const entries = readdirSync(process.cwd(), { withFileTypes: true });
      const matches = entries
        .filter((e) => e.name.startsWith(partial))
        .slice(0, 8)
        .map((e) => e.isDirectory() ? e.name + "/" : e.name);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return _commonPrefix(matches).slice(partial.length);
    } catch {}
    return null;
  }
  try {
    const dir = dirname(partial);
    const filePart = basename(partial);
    const fullDir = resolve(process.cwd(), dir);
    if (!existsSync(fullDir)) return null;
    const entries = readdirSync(fullDir, { withFileTypes: true });
    const matches = entries
      .filter((e) => e.name.startsWith(filePart))
      .slice(0, 8)
      .map((e) => (dir === "." ? "" : dir + "/") + (e.isDirectory() ? e.name + "/" : e.name));
    if (matches.length === 1) return matches[0].slice(partial.length);
    if (matches.length > 1) {
      const cp = _commonPrefix(matches);
      if (cp.length > partial.length) return cp.slice(partial.length);
    }
  } catch {}
  return null;
}

function _commonPrefix(strings) {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (const s of strings) {
    while (!s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  return prefix;
}

function slashCompletion(partial) {
  const matches = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(partial));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].cmd.slice(partial.length);
  const cps = matches.map((m) => m.cmd);
  const cp = _commonPrefix(cps);
  if (cp.length > partial.length) return cp.slice(partial.length);
  return null;
}

function historyCompletion(partial, history) {
  if (!partial || !history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (typeof h === "string" && h.startsWith(partial) && h.length > partial.length) {
      return h.slice(partial.length);
    }
  }
  return null;
}

export function suggestFor(input, history = []) {
  if (!input) return null;
  if (input.startsWith("/")) return slashCompletion(input);
  if (/^\.?\.?\/|^\.\.?\//.test(input) || input.includes("/")) {
    const fc = fileCompletions(input);
    if (fc) return fc;
  }
  if (/^[\w.-]+$/.test(input)) {
    try {
      const entries = readdirSync(process.cwd(), { withFileTypes: true });
      const match = entries.find((e) => e.name.startsWith(input) && e.name !== input);
      if (match) {
        return match.name.slice(input.length) + (match.isDirectory() ? "/" : " ");
      }
    } catch {}
  }
  const hc = historyCompletion(input, history);
  if (hc) return hc;
  return null;
}

// --- Key-aware readline with inline suggestion display ---

export function readlineWithSuggest(promptText, history = []) {
  return new Promise((resolve) => {
    const isTTY = process.stdin.isTTY && process.stdout.isTTY && !process.env.NO_COLOR;

    // Non-TTY (piped) fallback: simple line-based read.
    if (!isTTY) {
      process.stdout.write(promptText);
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
      return;
    }

    // TTY path: raw mode with inline suggestions.
    try { process.stdin.setRawMode(true); } catch {}
    process.stdout.write(promptText);

    let buf = "";
    let suggestion = "";

    function render() {
      process.stdout.write("\r\x1b[K");
      process.stdout.write(promptText);
      process.stdout.write(buf);
      if (suggestion && isTTY) {
        process.stdout.write("\x1b[2m" + suggestion + "\x1b[22m");
      }
      if (suggestion && isTTY) {
        process.stdout.write("\x1b[" + suggestion.length + "D");
      }
    }

    function recomputeSuggestion() {
      suggestion = suggestFor(buf, history) || "";
    }

    function acceptSuggestion() {
      if (suggestion) {
        buf += suggestion;
        suggestion = "";
        render();
      }
    }

    function finish(result) {
      if (isTTY) { try { process.stdin.setRawMode(false); } catch {} }
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(result);
    }

    function onData(chunk) {
      const data = chunk.toString();
      if (data === "\r" || data === "\n") { finish(buf); return; }
      if (data === "\u0003") { finish(null); process.exit(0); }
      if (data === "\u0004") {
        if (buf === "") { finish(null); process.exit(0); }
        return;
      }
      if (data === "\t" || data === "\x1b[C") { acceptSuggestion(); return; }
      if (data === "\x1b[D") return;
      if (data === "\x1b[A" || data === "\x1b[B") return;
      if (data === "\u007f" || data === "\b") {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          recomputeSuggestion();
          render();
        }
        return;
      }
      if (data === "\u0015") { buf = ""; suggestion = ""; render(); return; }
      if (data === "\u000c") { process.stdout.write("\x1b[2J\x1b[H"); render(); return; }
      if (data.startsWith("\x1b")) return;
      if (data.length === 1 && data >= " " && data <= "~") {
        buf += data;
        recomputeSuggestion();
        render();
        return;
      }
      if (!data.startsWith("\x1b") && /^[\x20-\x7e\u00a0-\uffff]+$/.test(data)) {
        buf += data;
        recomputeSuggestion();
        render();
      }
    }

    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}
