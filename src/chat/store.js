// Chat storage layer.
//
// Storage: each chat = one JSON file. Two scopes:
//   - global:  ~/.devbuddy/chats/<id>.json
//   - project: <cwd>/.devbuddy/chats/<id>.json
//
// Chat schema:
// {
//   id, scope ('global' | 'project'), scopePath, createdAt, updatedAt,
//   title (auto from first user msg), model, provider,
//   messages: [{ role, content, ts }]
// }

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { APP_DIR } from "../ui.js";
import { getActiveProviderId, getActiveModel } from "../ai/providers.js";

const GLOBAL_CHATS_DIR = join(APP_DIR, "chats");

function projectChatsDir(cwd) {
  return join(cwd || process.cwd(), ".devbuddy", "chats");
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function genId() {
  // Short, sortable, URL-safe: yyyymmdd-hhmmss-xxxx
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

export function createChat({ scope = "global", title = null, cwd = null } = {}) {
  const id = genId();
  const scopePath = scope === "project" ? (cwd || process.cwd()) : null;
  const chat = {
    id,
    scope,
    scopePath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: title || "(new chat)",
    provider: getActiveProviderId(),
    model: getActiveModel(),
    messages: [],
  };
  const dir = scope === "project" ? projectChatsDir(cwd) : GLOBAL_CHATS_DIR;
  ensureDir(dir);
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(chat, null, 2));
  return chat;
}

export function getChat(id, { cwd = null } = {}) {
  // Try project first, then global.
  const candidates = [
    join(projectChatsDir(cwd), `${id}.json`),
    join(GLOBAL_CHATS_DIR, `${id}.json`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function saveChat(chat, { cwd = null } = {}) {
  const dir = chat.scope === "project" ? projectChatsDir(chat.scopePath || cwd) : GLOBAL_CHATS_DIR;
  ensureDir(dir);
  chat.updatedAt = new Date().toISOString();
  writeFileSync(join(dir, `${chat.id}.json`), JSON.stringify(chat, null, 2));
  return chat;
}

export function listChats({ scope = "all", cwd = null } = {}) {
  const out = [];
  const pushFrom = (dir, scopeTag, scopePath = null) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const c = JSON.parse(readFileSync(join(dir, f), "utf8"));
        out.push({
          id: c.id,
          scope: scopeTag,
          scopePath,
          title: c.title,
          messageCount: (c.messages || []).length,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          model: c.model,
          preview: (c.messages || []).slice(-1)[0]?.content?.slice(0, 80) || "",
        });
      } catch {}
    }
  };
  if (scope === "all" || scope === "global") pushFrom(GLOBAL_CHATS_DIR, "global");
  if (scope === "all" || scope === "project") pushFrom(projectChatsDir(cwd), "project", cwd || process.cwd());
  // Sort: most recently updated first
  out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return out;
}

export function deleteChat(id, { cwd = null } = {}) {
  const candidates = [
    join(projectChatsDir(cwd), `${id}.json`),
    join(GLOBAL_CHATS_DIR, `${id}.json`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      unlinkSync(p);
      return true;
    }
  }
  return false;
}

export function branchChat(id, { cwd = null } = {}) {
  const orig = getChat(id, { cwd });
  if (!orig) return null;
  const branch = createChat({
    scope: orig.scope,
    title: `${orig.title} (branch)`,
    cwd: orig.scopePath || cwd,
  });
  branch.messages = [...orig.messages];
  branch.provider = orig.provider;
  branch.model = orig.model;
  branch.title = `${orig.title} (branch)`;
  return saveChat(branch, { cwd });
}

export function exportChatAsMarkdown(id, { cwd = null } = {}) {
  const chat = getChat(id, { cwd });
  if (!chat) return null;
  const lines = [];
  lines.push(`# ${chat.title}`);
  lines.push("");
  lines.push(`- **Chat ID:** ${chat.id}`);
  lines.push(`- **Scope:** ${chat.scope}${chat.scopePath ? ` (${chat.scopePath})` : ""}`);
  lines.push(`- **Provider:** ${chat.provider}`);
  lines.push(`- **Model:** ${chat.model}`);
  lines.push(`- **Created:** ${chat.createdAt}`);
  lines.push(`- **Updated:** ${chat.updatedAt}`);
  lines.push(`- **Messages:** ${chat.messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const m of chat.messages) {
    const role = m.role === "user" ? "🧑 You" : m.role === "assistant" ? "🤖 Assistant" : `📋 ${m.role}`;
    lines.push(`## ${role}`);
    lines.push(`*${m.ts || ""}*`);
    lines.push("");
    lines.push(m.content);
    lines.push("");
  }
  return { markdown: lines.join("\n"), chat };
}

// Append a message to a chat (auto-saves). Auto-generates title from first user msg.
export function appendMessage(chat, role, content) {
  chat.messages = chat.messages || [];
  chat.messages.push({ role, content, ts: new Date().toISOString() });
  if (chat.title === "(new chat)" && role === "user") {
    chat.title = content.slice(0, 60).replace(/\s+/g, " ").trim() || "(new chat)";
  }
  return saveChat(chat);
}
