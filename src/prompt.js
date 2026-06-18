// DEVBUDDY.md loader.
//
// Discovery order (first found wins):
//   1. <cwd>/DEVBUDDY.md
//   2. ~/.devbuddy/DEVBUDDY.md
//
// The loaded content becomes part of the system prompt for ask/explain/
// summarize/translate/chat/agent. Users can put project context, coding
// standards, preferred style, etc. in there.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "./ui.js";

const PROJECT_FILE = "DEVBUDDY.md";
const HOME_FILE = join(APP_DIR, "DEVBUDDY.md");

export function findDevbuddyMd(cwd = process.cwd()) {
  const project = join(cwd, PROJECT_FILE);
  if (existsSync(project)) return { path: project, source: "project", content: readFileSync(project, "utf8") };
  if (existsSync(HOME_FILE)) return { path: HOME_FILE, source: "home", content: readFileSync(HOME_FILE, "utf8") };
  return null;
}

export function loadDevbuddyMd(cwd = process.cwd()) {
  const found = findDevbuddyMd(cwd);
  return found ? found.content.trim() : "";
}

export function hasDevbuddyMd(cwd = process.cwd()) {
  return findDevbuddyMd(cwd) !== null;
}

// Render the DEVBUDDY.md content as a system-prompt suffix.
// Returns "" if no file found, so callers can unconditionally concatenate.
export function systemPromptSuffix(cwd = process.cwd()) {
  const content = loadDevbuddyMd(cwd);
  if (!content) return "";
  return `\n\n--- Project context (from DEVBUDDY.md) ---\n${content}\n--- end project context ---`;
}

// Create a template DEVBUDDY.md in the CWD.
export function createTemplate(cwd = process.cwd()) {
  const target = join(cwd, PROJECT_FILE);
  if (existsSync(target)) {
    return { created: false, path: target, reason: "already exists" };
  }
  const template = `# DEVBUDDY.md

> Project-specific context for devbuddy. The contents of this file are added
> to the system prompt for every AI command (ask, summarize, explain,
> translate, chat, agent) when run from this directory.

## Project

**Name:** (your project name)
**Stack:** (e.g. Node.js + Express + Postgres)
**Language:** (e.g. TypeScript, strict mode)

## Conventions

- Use 2-space indentation.
- Prefer named exports.
- All public functions need JSDoc comments.
- Errors are logged with the \`log\` helper, never \`console.log\` in production code.

## Where things live

- \`src/\` — application source
- \`src/routes/\` — HTTP route handlers
- \`src/db/\` — database access layer
- \`tests/\` — test files mirror src/ structure

## Things the AI should know

- The test runner is \`vitest\` (not jest). Run with \`npm test\`.
- Database migrations live in \`db/migrations/\` and use plain SQL.
- Don't introduce new top-level dependencies without asking.

## Style preferences

- Concise answers. No preamble.
- When showing code, include the file path as a comment on the first line.
- When fixing a bug, explain the root cause in one sentence before the fix.
`;
  writeFileSync(target, template);
  return { created: true, path: target };
}
