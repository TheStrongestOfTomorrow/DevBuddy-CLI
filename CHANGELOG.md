# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] — 2026-06-19

### Added

- **Unified REPL** (`src/commands/repl.js`). Running `devbuddy` with no subcommand now launches a single interactive session that does both chat AND agent. No more choosing upfront — start chatting, switch to agent mid-conversation, switch back.

- **`/agent` slash command** — switch to agent mode mid-session. Supports `--yolo` (skip confirms), `--safe` (force confirms on), `--allow <dir>` (grant extra directory access). Example: `/agent --yolo --allow ../shared-lib`.

- **`/chat` slash command** — switch back to chat mode.

- **`/mode` slash command** — show the current mode.

- **Mode indicator in prompt** — agent mode shows `[agent] >`, chat mode shows `>`. Always know which mode you're in at a glance.

- **`devbuddy --agent`** flag — launch directly in agent mode (skip the `/agent` toggle).

- **`devbuddy --yolo`** flag — when combined with `--agent`, starts agent mode with confirms skipped.

- Welcome banner now shows the current mode (chat or AGENT, with yolo indicator).

- `/help` now marks the active mode's command with `→`.

- Mode is included in `/history` and `/cost` output.

### Changed

- `devbuddy` with no subcommand used to print help and exit. Now it launches the unified REPL.
- `devbuddy chat` is now an alias for `devbuddy` — both launch the unified REPL. All `chat` subcommands (`list`, `show`, `branch`, `export`, `rm`) still work.
- `devbuddy agent run "<task>"` still works for one-shot agent runs (backwards compatible).
- Auto-update check now skips for the unified REPL (no command = REPL = interactive, don't interrupt).
- `readlineWithSuggest()` in `src/ui/suggest.js` now has a non-TTY fallback path (line-based read) so piped input works correctly.

### Design

The unified REPL is the new primary entry point. The old `devbuddy chat` and `devbuddy agent run` commands still work as aliases / one-shot variants, but the recommended flow is now:

```bash
devbuddy           # chat by default
/agent             # switch to agent mode
/chat              # switch back
```

This matches the UX of Gemini CLI and Qwen CLI where a single command launches the full interactive experience.

---

## [0.5.0] — 2026-06-19

### Added

- **Inline auto-suggest** (`src/ui/suggest.js`). Fish-shell-style suggestions in the chat REPL:
  - Slash commands (type `/` → shows matching commands)
  - File completion (type a path or bare filename → auto-completes from CWD)
  - History completion (type the start of a previous message → suggests the rest)
  - Press **Tab** or **→** to accept. Ctrl-U clears the line. Ctrl-L clears the screen.
  - Uses raw mode TTY input; falls back gracefully in non-TTY environments.

- **Sub-agents** (`src/agent/subagent/`). The main agent can spawn focused sub-agents via the new `agent` tool:
  - `agent` tool added to the main agent's tool registry (registered at module load via `registerSubAgentTool()`).
  - Sub-agents have their own ~12-step loop, max 1500 tokens per turn.
  - Sub-agents CANNOT call `agent` (no recursion) or `finish` (they use `return` instead).
  - Sub-agents can use a different model via the `model` parameter (e.g., use a cheap fast model for research, expensive model for code generation).
  - Sub-agents inherit the parent's allowlist (CWD + any `--allow` roots).
  - Sub-agent mutations still prompt for confirmation (sub-agents always run with `yolo=false`).
  - Box-drawing-bordered progress display shows sub-agent activity inline.

- **Multi-key onboarding**. After the primary provider is configured, onboard asks "Add another provider? [y/N]" in a loop. Each additional provider gets its own key + model picker. Already-configured providers are excluded from the list.

- **`devbuddy auth add <provider> <key>`** — add a key for another provider without re-onboarding. Options: `--model <name>`, `--switch` (switch active after adding).

- **`devbuddy auth switch <provider>`** — instantly switch the active provider. Refuses if no key is set for the target (with a helpful "add one with: devbuddy auth add ..." message). Options: `--model <name>`.

- **Post-install package integration**. Releases can ship a `packages.json` manifest at `scripts/packages-v<version>.json` (or top-level `packages.json`) listing extra npm packages to install + integration hooks to run. The updater fetches and applies it automatically after install.

- **Dual-channel auto-update** (`src/updater/updater.js` rewritten):
  - **Primary channel:** fetch `https://raw.githubusercontent.com/<repo>/main/scripts/update-v<version>.sh` and execute it with `bash`. Each version can have its own update script with version-specific migrations.
  - **Fallback channel:** if the `.sh` script 404s, fall back to `npm install -g <repo>` from the latest GitHub release.
  - Both channels run the packages manifest if one exists.

- **`scripts/update-v0.5.0.sh`** — the first tagged update script. Sets the convention: each release ships a script at `scripts/update-v<version>.sh` that handles the full update for that version.

- **`scripts/packages-v0.5.0.json`** — template manifest (empty for v0.5.0; future releases can add integration packages here).

- **New chat slash commands:**
  - `/reset` — clear conversation history (keeps the chat record)
  - `/agents` — list all available sub-agent models with their providers + which have keys
  - `/cost` — estimate tokens used + rough cost

- **Gemini-CLI-inspired welcome banner** in chat REPL. Shows chat title, ID, scope, model, provider, and DEVBUDDY.md context path in a box-drawing-bordered panel.

- `/clear` now re-renders the welcome banner (previously just cleared the screen).

- Ctrl-C and Ctrl-D in chat REPL now save the chat and exit cleanly (previously could leave a dangling turn).

### Changed

- Chat REPL now uses `readlineWithSuggest()` from `src/ui/suggest.js` instead of the bare `readline()`. The bare `readline()` is kept for non-suggest prompts (onboarding, confirmations).
- `toolsForPrompt()` in `src/agent/tools.js` now iterates `Object.keys(TOOLS)` dynamically so the `agent` tool appears in the system prompt.
- Help text in chat now renders from the `SLASH_COMMANDS` constant (single source of truth).
- Agent system prompt mentions sub-agents and the `agent` tool.

### Inspired by

- **Gemini CLI** — inline auto-suggest UX, welcome banner design, command palette feel
- **Qwen CLI** — chat REPL layout, slash command discoverability
- **OpenClaude** — sub-agent pattern (agent-as-tool)
- **Hermes** — provider abstraction extended to sub-agent model overrides

Core is now ~600 lines (up from ~400 in v0.4) with sub-agents + auto-suggest + multi-key. Still no external runtime deps beyond `chalk` and `commander`.

---

## [0.4.0] — 2026-06-18

### Added

- **Multi-message chat** (`devbuddy chat`). Interactive REPL with persistent storage. Features:
  - Global chats at `~/.devbuddy/chats/<id>.json`
  - Project-scoped chats at `./.devbuddy/chats/<id>.json` (use `--project`)
  - Resume with `--continue` or `--chat <id>`
  - Branch a chat with `devbuddy chat branch <id>` or `/branch` in-REPL
  - Export to Markdown with `devbuddy chat export <id>` (optionally `-o file.md`)
  - List, show, delete chats via subcommands
  - Slash commands: `/help`, `/exit`, `/clear`, `/save`, `/summary`, `/model`, `/system`, `/branch`, `/title`, `/history`, `/context`
  - Auto-saves on every message; auto-titles from first user message
  - Rolls back the user message if the AI reply fails (no dangling turns)
  - History capped at last 20 messages per AI call to manage token limits

- **`DEVBUDDY.md` project context** (`src/prompt.js`). Drop a `DEVBUDDY.md` in your project root and its contents are appended to the system prompt of every AI command. Discovery: `./DEVBUDDY.md` → `~/.devbuddy/DEVBUDDY.md`.

- **`devbuddy init`** — creates a `DEVBUDDY.md` template in the current directory.

- **Per-session directory grants** (`devbuddy agent run --allow <dir>`). Agent can be granted access to directories beyond CWD on a per-run basis. Repeatable flag.

- **Planner mode** (`devbuddy agent run --plan`). Agent calls the `plan` tool first with a list of steps, then executes step-by-step with progress display.

- **Auto-rollback**. If a tool fails mid-step, all `write_file`/`edit_file` mutations from that step are automatically rolled back. Backups recorded before each mutation; new files are deleted on rollback, modified files are restored.

- **Parallel reads**. Agent can emit multiple parallel-safe tools (read_file, list_files, glob_search) in a single turn via the `PARALLEL: ... END_PARALLEL` block. Non-parallel-safe tools (write_file, edit_file, run_shell) are refused in parallel blocks.

- **Project memory**. Agent reads `./.devbuddy/memory.md` at the start of each run if it exists. Update it manually to give the agent persistent notes across runs.

- **`glob_search` tool** — find files by pattern without running shell. Returns up to 50 matches across all allowed roots.

- **`plan` tool** — agent can record a multi-step plan that gets displayed to the user.

- All AI commands (ask, summarize, explain, translate) now use `DEVBUDDY.md` as context. The `ask` command prints "using project context: <path>" when a file is found.

- Auto-update check now skips interactive commands (chat, onboard) to avoid interrupting sessions.

### Changed

- Agent core (`src/agent/core.js`) rewritten:
  - Per-session allowlist with `resetSession()` and `enforcePath()`
  - Backups tracked globally per step, cleared at step start
  - `parseToolCalls()` now handles both single calls and `PARALLEL:` blocks
  - System prompt includes allowed roots, planner note, memory note, and `DEVBUDDY.md` content
  - Project memory pre-loaded into conversation history

- Agent tools (`src/agent/tools.js`) upgraded:
  - 8 tools (was 6): added `glob_search`, `plan`
  - Each tool tagged `parallelSafe`, `confirm`, `dangerous` as appropriate
  - `write_file` and `edit_file` record backups via `recordBackup()`
  - `executeToolsParallel()` enforces parallel-safety
  - `rollbackStep()` and `clearBackups()` exposed for the core to call

- `devbuddy agent run` gains `--allow <dir>` (repeatable) and `--plan` flags.

- Help text updated with chat, init, and project context info.

### Inspired by

- **Aider** — auto-rollback on failure
- **Cline** — planner mode + progress display + project memory file
- **Continue** — project-context file (`.continuerc.json` → `DEVBUDDY.md`)

Core agent is now ~400 lines (up from ~200 in v0.3) but with 6× the features.

---

## [0.3.0] — 2026-06-18

### Added

- **Agentic harness** (`devbuddy agent`). Off by default; enable with `devbuddy agent toggle`. The agent can:
  - `read_file` — read file contents (max 200KB per read)
  - `write_file` — write new files (auto-creates parent dirs)
  - `edit_file` — find-and-replace in existing files (refuses non-unique matches)
  - `list_files` — list directory contents
  - `run_shell` — execute shell commands (30s timeout, max 1MB output)
  - `finish` — signal task complete

  Inspired by OpenClaude (minimal tool-use loop) and Hermes (provider abstraction). Stripped to ~200 lines of core logic.

- **9 supported providers**: HuggingFace (free), OpenAI, Anthropic, Groq (free), OpenRouter, Ollama (local), Together (free), Mistral, Cohere.

- **`devbuddy onboard`** — interactive setup wizard. Picks provider + API key + model + language + auto-update preference + optional test call.

- **Onboarding gate**: AI commands (`ask`, `summarize`, `explain`, `translate`, `agent`) refuse with a friendly error until onboarding is complete.

- **Auto-update**: checks GitHub releases on launch (caches for 1 hour). Modes:
  - `prompt` (default) — check, ask Y/n, install if yes
  - `silent` — check, install without asking
  - `off` — never check

- **`devbuddy update`** command for manual checks.

- **Safety guards in the agent**:
  - File access constrained to current working directory (no path traversal)
  - Mutating actions prompt for confirmation by default
  - `--yolo` flag (or `agentYolo` config) skips confirms — DANGEROUS
  - Tool results truncated to 4KB to keep history manageable

- **Per-call `--model` override** on `ask`, `summarize`, `explain`, `translate`, `agent run`.

- **`--max-tokens` flag** on all AI commands.

- **Token masking** in `auth status` and `config list` for any string field containing "key" or "token".

- **Migration logic**: v0.2 configs (with `hfToken`/`hfModel`/`hfBaseUrl`) are automatically migrated to the new `providers` map structure on first run.

- This `CHANGELOG.md`.

### Changed

- **Config schema rewritten**. New keys: `onboardingComplete`, `onboardedAt`, `provider`, `providers` (per-provider `{apiKey, model}` map), `agentEnabled`, `agentYolo`, `agentMaxSteps`, `autoUpdate`, `lastUpdateCheck`.
- `auth set` now saves BEFORE verifying, so verification failures (e.g. from rate-limited networks) don't block saving.
- `auth` command is now provider-aware: `auth set <key> --provider groq` switches active provider.
- Help text lists all providers and flags `onboard` as required.
- README rewritten with full provider table, agent docs, design notes, and troubleshooting.

### Removed

- `hfToken`, `hfModel`, `hfBaseUrl` config keys (replaced by `providers.huggingface.{apiKey,model}`). Auto-migrated on first load.

---

## [0.2.0] — 2026-06-18

### ⚠️ Breaking

- Switched AI backend from `z-ai-web-dev-sdk` (internal Z.ai sandbox SDK, unusable outside the sandbox) to the HuggingFace Inference API (free, public).

### Added

- `devbuddy auth` command with `set`, `status`, `verify`, `clear`, `models`.
- Rate-limit awareness: one-time warning on first AI call per session; 429 errors surfaced with actionable messages.
- `--model` and `--max-tokens` flags on AI commands.
- Token masking in `config list` / `auth status`.
- Graceful token verification (save succeeds even if verify hits IP rate limit).
- Troubleshooting table in README.
- `CHANGELOG.md`.

### Removed

- `z-ai-web-dev-sdk` runtime dependency. Runtime deps now: just `chalk` and `commander`.

---

## [0.1.0] — 2026-06-18

### ⚠️ Known issue (fixed in 0.2.0)

Published with a dependency on `z-ai-web-dev-sdk`, which only works inside the Z.ai sandbox. Real users could not use any AI command. Fixed in v0.2.0.

### Added

- Initial release.
- Commands: `ask`, `summarize`, `explain`, `translate`, `todo`, `config`.
- Minimal ripgrep-style theme.
- Zero-dep spinner.
- Persistent config + todos under `~/.devbuddy/`.
- `--json` output on AI commands, `--no-color` / `NO_COLOR` support.
