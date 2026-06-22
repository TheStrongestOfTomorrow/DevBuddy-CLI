# devbuddy

> **v1.1.3** — AI-powered dev CLI with unified chat + agent REPL, **streaming responses**, **thinking mode toggle**, **DevBuddy as an MCP server**, **phone control (ADB/Shizuku)**, **Ollama support (no API key needed)**, 9 providers, sub-agents, **commit/review/doctor** commands, and dual-channel auto-update. Inspired by Gemini CLI, Qwen CLI, OpenClaude, Hermes, Aider, Cline, ClosePaw — still smaller than all of them.

[![Version](https://img.shields.io/badge/version-1.1.3-cyan)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](#)

---

## What's new in v1.1.3

- 🧠 **Thinking mode toggle** — `/thinking` in the chat REPL toggles step-by-step reasoning on/off. When on, the AI shows its reasoning before the final answer. When off (default), direct answers. Also `devbuddy ask --thinking` for one-shot use. `summarize`, `explain`, `translate` stay no-thinking by default.

## What was new in v1.1.2 (hotfix)

- 📱 **Custom rish path** — `devbuddy phone rish-path <path>` lets you set a custom path to the `rish` binary (Shizuku), for when it's not on PATH.

## What was new in v1.1.1 (hotfix)

- 🛠️ **Updater timeout fix** — GitHub API timeout increased from 4s → 15s, with 2 retries. Fixes `devbuddy update` failing on slow networks (e.g. Termux on phone).
- 🚀 **`devbuddy update --force-install`** — skips the GitHub API check entirely and just runs `npm install -g` directly. Use when the API times out or is rate-limited.

## What was new in v1.1.0

- 📱 **Phone control (experimental)** (`devbuddy phone`) — AI agent can control your Android phone via ADB or Shizuku (rish). 11 tools: tap, swipe, type, screenshot, launch apps, run shell, etc. **Ollama-only** for safety (no cloud APIs see your phone screen). Strict trust gate: type `I trust this AI` to enable. Inspired by [ClosePaw](https://github.com/imoonkey/closepaw).

## What was new in v1.0.1

- ✎ **Custom model ID during onboarding** — model picker now has a "Type your own model ID…" option for downloaded Ollama models, fine-tunes, or any unlisted model.
- 🔧 **`devbuddy auth model [name]`** — set or show the active provider's model. Accepts any model ID (no list restriction).

## What was new in v1.0.0 (major)

- 📡 **DevBuddy as an MCP server** (`devbuddy act-as-mcp`) — expose DevBuddy's capabilities as MCP tools. SSE + stdio transports. 12 exposed tools.
- 🌊 **Streaming responses** — `devbuddy ask` and the unified REPL stream tokens as they arrive.
- 🦙 **Ollama auth fix** — Ollama no longer requires an API key. Use it locally with zero setup.
- 📝 **`devbuddy commit`** — generate conventional commit messages from git diff.
- 🔍 **`devbuddy review`** — AI code review on staged/unstaged/commit (streaming).
- 🩺 **`devbuddy doctor`** — diagnose setup issues.
- 📜 **`devbuddy history`** — command history across sessions.
- 🎨 **Theme support** — `config set theme dark|light|auto`.

## What was new in v0.5.5

- 🔌 **MCP server support**, 🧪 **experimental remote-AI (SSH/Claude)**, 🔧 **5 new agent tools** (grep_search, web_fetch, memory_update, git_diff, tree).

## What was new in v0.5.1

- 🎯 **Unified REPL** — `devbuddy` (no subcommand) launches chat + agent in one session. `/agent` and `/chat` to switch modes.

## What was new in v0.5.0

- 🐟 **Inline auto-suggest**, 🤖 **Sub-agents**, 🔑 **Multi-key onboarding**, 🛠️ **Dual-channel auto-update**.

- 🐟 **Inline auto-suggest** in the chat REPL — fish-shell style. Type `/` and commands suggest themselves; type a filename and it auto-completes from CWD; type the start of a previous message and history suggests the rest. Press **Tab** or **→** to accept.
- 🤖 **Sub-agents** (`agent` tool) — the main agent can spawn focused sub-agents for subtasks, optionally with a different model. Sub-agents have their own tool loop (minus `agent` and `finish` to prevent recursion) and use a `return` tool to bubble results back.
- 🔑 **Multi-key onboarding** — onboard now asks "add another provider?" in a loop. Configure multiple providers in one pass.
- ➕ **`devbuddy auth add`** — add a key for another provider without re-onboarding.
- 🔄 **`devbuddy auth switch`** — instantly switch the active provider (uses a key you already added).
- 📦 **Post-install package integration** — releases can ship a `packages.json` manifest listing extra npm packages to auto-install + integration hooks to run.
- 🛠️ **Dual-channel auto-update** — updater fetches a tagged `.sh` script (`scripts/update-v<version>.sh`) first, falls back to `npm install -g` from GitHub releases if the script is missing.
- 💬 **New slash commands**: `/reset` (clear history, keep chat), `/agents` (list sub-agent models), `/cost` (token estimate).
- 🎨 **Gemini-CLI-inspired welcome banner** in chat REPL.

See [CHANGELOG.md](./CHANGELOG.md) for the full diff.

---

## Install

> ℹ️ **npm package not registered yet.** Install directly from GitHub.

```bash
npm install -g TheStrongestOfTomorrow/DevBuddy-CLI
```

### Requirements

- **Node.js >= 18** (uses native `fetch`)
- An API key for one of the supported providers (HuggingFace and Groq have free tiers — recommended for trying it out). **Ollama needs no key** if you want to run fully locally.

---

## Quick start

```bash
# 1. Install (see above)

# 2. Onboard (one time, ~1 min)
devbuddy onboard

# 3. Just run devbuddy — launches unified chat + agent REPL (streaming)
devbuddy
# > hello!                    # chat mode, tokens stream as they arrive
# ai · Hi there! How can I help?
# > /agent                    # switch to agent mode
# [agent] > add a hello world route to app.js
# [agent] > /chat             # switch back
# > /exit

# 4. One-shot commands (all streaming)
devbuddy ask "what is a closure?"
devbuddy commit               # generate commit message from git diff
devbuddy review               # AI code review on staged changes
devbuddy doctor               # diagnose setup issues

# 5. Ollama (no API key needed!)
devbuddy onboard              # pick ollama, no key needed
devbuddy ask "hello"          # uses local ollama

# 6. DevBuddy as an MCP server (experimental)
devbuddy config set experimentalActAsMcp true
devbuddy act-as-mcp           # starts SSE server on :8765
# Other MCP clients can now connect to http://127.0.0.1:8765/sse

# 7. Phone control (experimental, Ollama-only)
devbuddy phone enable         # type "I trust this AI" to confirm
devbuddy --phone              # unified REPL with phone tools
devbuddy agent run --phone "open WhatsApp and send a message to Mom"
```

---

## Providers

| Provider | Free? | Default model |
|----------|-------|---------------|
| HuggingFace | ✅ | mistralai/Mistral-7B-Instruct-v0.3 |
| OpenAI | ❌ | gpt-4o-mini |
| Anthropic | ❌ | claude-3-5-sonnet-20241022 |
| Groq | ✅ | llama-3.3-70b-versatile |
| OpenRouter | ❌ | openai/gpt-4o-mini |
| Ollama (local) | ✅ | llama3.2 |
| Together | ✅ | meta-llama/Llama-3.3-70B-Instruct-Turbo-Free |
| Mistral | ❌ | mistral-small-latest |
| Cohere | ❌ | command-r-plus |

Switch any time: `devbuddy onboard --force` or `devbuddy auth set <key> --provider groq`.

---

## Commands

### `devbuddy onboard`
Interactive setup wizard. **Required** before any AI command. ~1 minute.

### `devbuddy init` (NEW in v0.4)
Create a `DEVBUDDY.md` template in the current directory.

```bash
devbuddy init           # creates DEVBUDDY.md
devbuddy init --force   # overwrite if exists
```

The template includes sections for project name, stack, conventions, file layout, AI notes, and style preferences. Edit it to describe your project — every AI command will use it as context.

Discovery order: `./DEVBUDDY.md` (project) → `~/.devbuddy/DEVBUDDY.md` (global fallback).

### `devbuddy chat` (NEW in v0.4)
Multi-message chat with AI. Saved to disk automatically.

```bash
devbuddy chat                          # start new global chat
devbuddy chat --project                # scope to current dir
devbuddy chat -c                       # resume most recent
devbuddy chat --chat <id>              # resume specific
devbuddy chat list                     # list saved chats
devbuddy chat list --scope project     # only project chats
devbuddy chat show <id>                # full message history
devbuddy chat branch <id>              # branch a chat
devbuddy chat export <id>              # export as Markdown
devbuddy chat export <id> -o out.md    # write to file
devbuddy chat rm <id>                  # delete
```

**In-REPL slash commands:**
- `/help` — show available commands
- `/exit` or `/quit` — save and exit
- `/clear` — clear screen
- `/save` — force-save
- `/summary` — AI generates a 1-paragraph summary of the chat so far
- `/model <name>` — switch model for subsequent turns
- `/system <text>` — set/override system prompt (`/system clear` to reset)
- `/branch` — branch the chat at the current point
- `/title <text>` — rename the chat
- `/history` — message count + token estimate
- `/context` — show which `DEVBUDDY.md` is being used

**Storage:**
- Global chats: `~/.devbuddy/chats/<id>.json`
- Project chats: `./.devbuddy/chats/<id>.json`

Each chat is a single JSON file — easy to back up, copy, or inspect.

### `devbuddy ask "<question>"`
Ask any question. Uses `DEVBUDDY.md` as context if present.

### `devbuddy summarize <file>`
Condense a file (or stdin) into key points.

### `devbuddy explain <file>`
Explain code in plain language.

### `devbuddy translate "<text>"`
Translate text.

### `devbuddy agent`
Agentic harness — read, write, edit files; run shell commands. **Off by default.**

```bash
devbuddy agent toggle                  # enable
devbuddy agent status                  # show config
devbuddy agent run "<task>"            # run
devbuddy agent run --plan "<task>"     # planner mode (NEW)
devbuddy agent run --allow <dir> "<task>"  # grant extra dir access (NEW)
devbuddy agent run --yolo "<task>"     # skip confirms (DANGEROUS)
devbuddy agent run --max-steps 30 "<task>"
devbuddy agent toggle --off            # disable
```

**Tools available to the agent:**
- `read_file` — read a file's contents (parallel-safe, 200KB max)
- `write_file` — write a new file (or overwrite)
- `edit_file` — find-and-replace in an existing file (refuses non-unique matches)
- `list_files` — list a directory (parallel-safe)
- `glob_search` — find files by pattern (parallel-safe, NEW)
- `run_shell` — execute a shell command (30s timeout)
- `plan` — record a multi-step plan (NEW)
- `finish` — signal task complete

**Safety:**
- **Per-session allowlist:** agent can only access CWD by default. Grant more with `--allow <dir>` (repeatable).
- **CWD-traversal blocked:** even with `--allow`, paths must fall within an allowed root.
- **Mutating actions prompt for confirmation** by default. `--yolo` skips (DANGEROUS).
- **Auto-rollback:** if a tool fails mid-step, all `write_file` / `edit_file` mutations from that step are rolled back automatically.
- **Shell commands time out after 30s.**
- **Project context loaded:** `DEVBUDDY.md` is added to the agent's system prompt.
- **Project memory loaded:** `./.devbuddy/memory.md` (if present) is shown to the agent at the start of each run — update it to give the agent persistent notes.

### `devbuddy auth`
Manage API keys across all providers.

```bash
devbuddy auth                          # status
devbuddy auth providers                # list all 9 providers
devbuddy auth set <key>                # set key for active provider
devbuddy auth set <key> --provider groq
devbuddy auth add <provider> <key>     # add key without switching (v0.5+)
devbuddy auth switch <provider>        # switch active provider (v0.5+)
devbuddy auth model [name]             # set/show model — any ID works (v1.0.1+)
devbuddy auth model llama3.2:8b        # custom model IDs allowed
devbuddy auth clear [provider]
```

### `devbuddy phone` (v1.1.0, experimental)
AI phone control via ADB/Shizuku. **Ollama-only.**

```bash
devbuddy phone enable                  # strict trust gate (type "I trust this AI")
devbuddy phone enable --mode rish      # Shizuku mode (on-phone)
devbuddy phone enable --mode rish --rish-path /data/data/moe.shizuku.privileged.api/start.sh
devbuddy phone rish-path /path/to/rish # set custom rish binary location (v1.1.2)
devbuddy phone rish-path ""            # clear (use rish from PATH)
devbuddy phone status                  # show config + connectivity
devbuddy phone test                    # test connectivity
devbuddy phone devices                 # list connected devices
devbuddy phone disable                 # disable
```

Then use with `devbuddy --phone` or `devbuddy agent run --phone "<task>"`.

### `devbuddy todo`
Quick local todos with priorities. **Offline — no AI needed.**

### `devbuddy config`
Persistent settings at `~/.devbuddy/config.json`.

```bash
devbuddy config                        # show all
devbuddy config set language zh
devbuddy config set agentEnabled true
devbuddy config set agentYolo false    # (don't enable this casually)
devbuddy config set autoUpdate silent
devbuddy config reset
```

### `devbuddy update`
Manually check for and install updates.

```bash
devbuddy update           # check + install
devbuddy update --check   # check only
```

---

## MCP (Model Context Protocol) servers

Connect devbuddy to any MCP server — locally via stdio, or remotely via HTTP/SSE. MCP tools are auto-discovered and made available to the agent.

### Configure

```bash
# Add a stdio server (runs a local command)
devbuddy mcp add filesystem stdio \
  --command npx \
  --args -y @modelcontextprotocol/server-filesystem /path/to/allow

# Add an HTTP server (remote)
devbuddy mcp add remote-api http \
  --url https://example.com/mcp \
  --header "Authorization=Bearer secret"

# List configured servers
devbuddy mcp list

# Test a server (connects + lists its tools)
devbuddy mcp test filesystem

# Remove a server
devbuddy mcp remove filesystem
```

### Config files (layered)

| Source | Path | Notes |
|--------|------|-------|
| Global | `~/.devbuddy/mcp.json` | All projects |
| Project | `./.devbuddy/mcp.json` | Overrides global (per-project) |
| config.json | `~/.devbuddy/config.json` `mcp` section | Overrides files |

Load order: global → project → config.json (later wins).

### Using MCP tools in the agent

When you run `devbuddy agent`, MCP tools are auto-discovered and registered with the prefix `mcp_<server>_<tool>`. The agent can call them like any other tool:

```
TOOL: mcp_filesystem_read_file
{"path": "/path/to/file"}
END_TOOL
```

The agent's system prompt automatically lists all available MCP tools.

---

## Experimental: Remote AI connector

⚠️ **Experimental.** For users who don't have local API keys and want to use a remote AI instead. Gated by `experimentalRemoteAI: true` config.

### Enable

```bash
devbuddy config set experimentalRemoteAI true
```

### SSH connector

Run prompts on a remote machine that has `devbuddy-agent` (or any command that reads stdin and writes stdout).

```bash
# One-shot
devbuddy remote ssh user@gpu-box "explain this code: $(cat src/app.js)"

# Interactive
devbuddy remote ssh user@gpu-box

# Test connectivity
devbuddy remote ssh-test user@gpu-box

# Options
devbuddy remote ssh user@host "prompt" --port 2222 --identity ~/.ssh/id_ed25519 --command my-agent
```

### Claude Desktop connector

Talk to a local Claude Desktop instance via its MCP server. Requires Claude Desktop running with MCP enabled.

```bash
devbuddy remote claude "what is 2 + 2?"
devbuddy remote claude-test
```

### Status

```bash
devbuddy remote status
```

⚠️ **Warnings:**
- SSH: prompts are sent to the remote machine in plaintext over SSH. Make sure you trust the remote.
- Claude Desktop: requires Claude Desktop installed and configured to expose a chat tool via MCP.
- This feature is experimental and may change or be removed in future versions.

---

## DevBuddy as an MCP server (experimental)

Run DevBuddy itself as an MCP server. Other MCP clients (Claude Desktop, etc.) can connect and use DevBuddy's capabilities.

### Enable (gated)

```bash
devbuddy config set experimentalActAsMcp true
```

### Run as SSE server (HTTP)

```bash
devbuddy act-as-mcp                              # default: SSE on :8765
devbuddy act-as-mcp --port 9000 --host 0.0.0.0   # custom port/host
```

Other MCP clients connect to `http://127.0.0.1:8765/sse`.

### Run as stdio server

```bash
devbuddy act-as-mcp --transport stdio
```

Launched by another MCP client (e.g., Claude Desktop config) — communicates via stdin/stdout.

### Exposed tools (12)

| Tool | Description |
|------|-------------|
| `chat` | Forward a prompt to DevBuddy's configured AI provider |
| `read_file` | Read a file (CWD-scoped) |
| `write_file` | Write a file |
| `edit_file` | Find-and-replace in a file |
| `list_files` | List directory contents |
| `grep_search` | Regex search of file contents |
| `glob_search` | Find files by pattern |
| `run_shell` | Run a shell command |
| `list_todos` | List DevBuddy todos |
| `add_todo` | Add a todo |
| `done_todo` | Mark a todo as done |
| `get_config` | Get current config (keys masked) |

---

## New v1.0 commands

### `devbuddy commit`
Generate a conventional commit message from staged changes.

```bash
devbuddy commit                  # show suggested message
devbuddy commit --apply          # commit with the message (after confirm)
devbuddy commit --unstaged       # use unstaged changes
```

### `devbuddy review`
AI code review on a diff (streaming output).

```bash
devbuddy review                  # review staged changes
devbuddy review --unstaged       # review unstaged
devbuddy review --commit HEAD~1  # review a specific commit
```

### `devbuddy doctor`
Diagnose setup issues.

```bash
devbuddy doctor                  # checks Node, config, keys, MCP, network, git
```

### `devbuddy history`
Show command history.

```bash
devbuddy history                 # last 20 commands
devbuddy history -n 50           # last 50
devbuddy history --grep "agent"  # filter
devbuddy history --clear         # clear history
```

---

## Phone control (experimental, v1.1.0)

⚠️ **Experimental + dangerous.** Lets the AI agent control your Android phone via ADB or Shizuku (rish). **Ollama-only** for safety — no cloud APIs see your phone screen.

### Enable (strict trust gate)

```bash
# 1. Switch to Ollama (required)
devbuddy onboard          # pick ollama
# (or) devbuddy auth switch ollama

# 2. Enable phone control
devbuddy phone enable
# → shows all 11 tools
# → checks ADB/rish connectivity
# → type "I trust this AI" verbatim to confirm
```

### Use

```bash
# Unified REPL with phone tools
devbuddy --phone

# One-shot agent with phone tools
devbuddy agent run --phone "open WhatsApp and send a message to Mom"
devbuddy agent run --phone "take a screenshot and tell me what's on screen"
devbuddy agent run --phone "open settings and turn on battery saver"
```

### 11 phone tools

| Tool | Description | Tags |
|------|-------------|------|
| `phone_devices` | List connected devices / verify Shizuku | parallel-safe |
| `phone_screenshot` | Capture screenshot to `.devbuddy/phone-screenshots/` | — |
| `phone_tap` | Tap at (x, y) | confirm |
| `phone_long_press` | Long-press at (x, y) | confirm |
| `phone_swipe` | Swipe from (x1,y1) to (x2,y2) | confirm |
| `phone_type` | Type text into focused field | confirm |
| `phone_key` | Send key event (home, back, power, etc.) | confirm |
| `phone_launch_app` | Launch app by package name | confirm |
| `phone_list_apps` | List installed apps | parallel-safe |
| `phone_current_app` | Get focused app's package name | parallel-safe |
| `phone_shell` | Run arbitrary shell command | confirm, **DANGEROUS** |

### Two control modes

- **`adb`** (default) — DevBuddy runs on PC, phone connected via USB or WiFi (`adb connect <ip>:5555`). Commands run via `adb shell ...`.
- **`rish`** — DevBuddy runs on the phone itself (e.g. Termux), uses [Shizuku](https://shizuku.rikka.app/) for ADB-level access without root. Commands run via `rish ...`.

```bash
devbuddy phone enable --mode rish   # for on-phone Shizuku mode
devbuddy phone enable --mode adb    # for PC→phone ADB mode (default)
```

### Management

```bash
devbuddy phone status    # show config + connectivity
devbuddy phone test      # test connectivity only
devbuddy phone devices   # list connected devices (ADB mode)
devbuddy phone disable   # disable phone control
```

### Safety

1. **Ollama-only** — phone control sends screen content to the AI. Ollama runs locally, so no data leaves your machine. Cloud APIs (OpenAI, Anthropic, etc.) would receive your phone screen, which is unsafe.
2. **Strict trust gate** — `devbuddy phone enable` lists all 11 tools with their tags, checks connectivity, then requires typing `I trust this AI` verbatim.
3. **`phone_shell` blocks** `rm -rf /`, `dd if=`, `mkfs` commands.
4. **All mutating tools** (tap, swipe, type, key, launch, shell) prompt for confirmation by default. Use `--yolo` to skip (DANGEROUS).

### Prerequisites

**ADB mode:**
- `adb` installed (`apt install adb` / `brew install adb`)
- Phone has USB debugging enabled (Developer Options → USB Debugging)
- Phone connected via USB, or `adb connect <phone-ip>:5555` for WiFi
- Verify: `adb devices` should list your phone

**rish mode:**
- [Shizuku](https://shizuku.rikka.app/) app installed and running on the phone
- `rish` shell on your PATH (Shizuku provides this)
- DevBuddy running on the phone itself (e.g. in Termux)

### Inspired by

- [ClosePaw](https://github.com/imoonkey/closepaw) — open-source Android phone-use agent. Their toolset (mobile_action, open_app, system_button, shell, screenshot) maps directly to DevBuddy's 11 phone tools.
- [Shizuku](https://shizuku.rikka.app/) — ADB-level access without root, for on-phone mode.

---

## Project context: DEVBUDDY.md

Drop a `DEVBUDDY.md` in your project root. Its contents are appended to the system prompt of every AI command run from that directory.

Example:

```markdown
# DEVBUDDY.md

## Project
**Name:** my-api
**Stack:** Node.js + Express + Postgres

## Conventions
- 2-space indentation
- Prefer named exports
- All public functions need JSDoc comments

## Things the AI should know
- Test runner is vitest (not jest)
- Don't introduce new top-level dependencies without asking
```

Discovery order: `./DEVBUDDY.md` (project) → `~/.devbuddy/DEVBUDDY.md` (global).

Run `devbuddy init` to create a template.

---

## How the agentic harness evolved (design notes)

DevBuddy takes inspiration from many open-source agentic harnesses, while staying smaller than any of them:

**From OpenClaude:**
- ✅ Single-file agent core, tool registry as plain object
- ✅ Plain-text tool-call protocol (works with small models)
- ✅ Sub-agent pattern (agent-as-tool, v0.5+)

**From Hermes:**
- ✅ Provider abstraction (9 providers, one interface)
- ✅ `grep_search` + `web_fetch` tools (v0.5.5+)

**From Aider (v0.4+):**
- ✅ Auto-rollback on failure — mutations in a failed step are reverted
- ✅ Per-file backups recorded before each mutation
- ✅ `git_diff` tool (v0.5.5+)

**From Cline (v0.4+):**
- ✅ Planner mode — agent writes a plan first, then executes step-by-step
- ✅ Progress display between steps
- ✅ Project memory file (`.devbuddy/memory.md`)
- ✅ `memory_update` tool (v0.5.5+)

**From Continue (v0.4+):**
- ✅ `DEVBUDDY.md` project context (similar to `.continuerc.json`)
- ✅ Auto-discovery from CWD with home fallback

**From Gemini CLI / Qwen CLI (v0.5+):**
- ✅ Inline auto-suggest in the REPL (fish-shell style)
- ✅ Unified REPL (chat + agent in one session, switch with `/agent`)
- ✅ Welcome banner design

**From ClosePaw (v1.1.0+):**
- ✅ Phone control toolset (`phone_tap`, `phone_swipe`, `phone_type`, `phone_screenshot`, `phone_launch_app`, `phone_shell`)
- ✅ Two control modes (ADB for PC→phone, Shizuku/rish for on-phone)
- ✅ Safety-first design (Ollama-only, trust gate)

**What we still don't have (by design):**
- ❌ Tree-of-thought planning (linear plans only)
- ❌ Vector embeddings / RAG (use `DEVBUDDY.md` instead)
- ❌ Multi-modal (text only — phone screenshots are saved as files, not sent to the model)
- ❌ Plugin system (yet)

The core is ~6800 lines across 56 files, with 2 runtime deps (`chalk`, `commander`). Still smaller than OpenClaude, Hermes, Aider, Cline, Continue, or ClosePaw.

---

## Files

- `~/.devbuddy/config.json` — settings
- `~/.devbuddy/chats/<id>.json` — global chats
- `~/.devbuddy/DEVBUDDY.md` — global project context (fallback)
- `~/.devbuddy/mcp.json` — MCP server config (global)
- `~/.devbuddy/history.jsonl` — command history
- `~/.devbuddy/todos.json` — todos
- `./.devbuddy/chats/<id>.json` — project-scoped chats
- `./.devbuddy/mcp.json` — MCP server config (project)
- `./.devbuddy/memory.md` — agent project memory
- `./.devbuddy/phone-screenshots/` — phone screenshots (v1.1.0+)
- `./DEVBUDDY.md` — project context (preferred)

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `DevBuddy is not onboarded yet` | `devbuddy onboard` |
| `No API key set for X` | `devbuddy auth set <key>` or `devbuddy onboard --force` |
| `rate limit hit (429)` | Wait, switch models, or switch providers |
| `rejected your API key (HTTP 401)` | Re-create key at provider's site, re-onboard |
| `Agent mode is currently OFF` | `devbuddy agent toggle` |
| `Refusing to access path outside allowed roots` | Run from your project root, or use `--allow <dir>` |
| `old_string appears N times; needs to be unique` | Make the search string more specific (include surrounding context) |
| `Phone control is Ollama-only` | Switch: `devbuddy auth switch ollama` |
| `Phone not accessible in 'adb' mode` | Install adb, enable USB debugging, connect phone |
| `act-as-mcp is experimental and gated` | `devbuddy config set experimentalActAsMcp true` |
| Run `devbuddy doctor` to diagnose other issues |

---

## Roadmap

- [ ] Publish to npm as `devbuddy`
- [x] ~~Streaming responses~~ ✅ v1.0.0
- [x] ~~`devbuddy commit`~~ ✅ v1.0.0
- [x] ~~`devbuddy review`~~ ✅ v1.0.0
- [x] ~~Phone control~~ ✅ v1.1.0
- [ ] iOS support for phone control (via AppleScript/Shortcuts — limited)
- [ ] Multi-modal (send phone screenshots directly to vision models)
- [ ] Plugin system for custom tools

## Contributing

PRs welcome!

```bash
git clone https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI.git
cd DevBuddy-CLI
npm install
node bin/devbuddy.js --help
```

## License

MIT — see [LICENSE](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Project structure

```
DevBuddy-CLI/
├── bin/
│   └── devbuddy.js
├── scripts/
│   ├── update-v1.1.0.sh          # tagged update script (dual-channel updater)
│   ├── packages-v1.1.0.json      # package manifest (empty)
│   └── ... (update-v0.5.0.sh, update-v1.0.0.sh, update-v1.0.1.sh, etc.)
├── src/
│   ├── index.js                  # entrypoint + auto-update wiring + --phone flag
│   ├── ui.js                     # minimal theme + spinner
│   ├── store.js                  # config + todos persistence (v1.1 schema)
│   ├── prompt.js                 # DEVBUDDY.md loader
│   ├── ai/
│   │   └── providers.js          # 9-provider adapter + streaming (completeStream)
│   ├── agent/
│   │   ├── core.js               # planner loop + auto-rollback + parallel reads + phone/MCP registration
│   │   ├── tools.js              # 13 built-in tools + allowlist + rollback tracking
│   │   ├── phone-tools.js        # 11 ADB/Shizuku phone tools (v1.1.0)
│   │   ├── mcp-bridge.js         # MCP → agent tool bridge
│   │   └── subagent/
│   │       └── index.js          # sub-agent system (agent-as-tool)
│   ├── chat/
│   │   └── store.js              # chat persistence (global + project scopes)
│   ├── mcp/
│   │   ├── client.js             # MCP client (stdio + HTTP/SSE)
│   │   ├── config.js             # MCP server config loader (layered)
│   │   └── server.js             # DevBuddy as MCP server (act-as-mcp)
│   ├── remote/
│   │   ├── ssh.js                # experimental SSH remote-AI connector
│   │   └── claude-desktop.js     # experimental Claude Desktop connector
│   ├── ui/
│   │   └── suggest.js            # fish-shell-style inline auto-suggest
│   ├── updater/
│   │   └── updater.js            # dual-channel auto-update (.sh + releases)
│   └── commands/
│       ├── onboard.js            # interactive setup wizard + multi-key + custom model
│       ├── repl.js               # unified chat + agent REPL (v0.5.1+)
│       ├── init.js               # DEVBUDDY.md template
│       ├── chat.js               # chat alias + subcommands (list/show/branch/export/rm)
│       ├── ask.js                # streaming AI Q&A
│       ├── auth.js               # multi-provider key management + auth model
│       ├── agent.js              # agent run/toggle/status (--allow, --plan, --phone)
│       ├── phone.js              # phone control enable/disable/status/test (v1.1.0)
│       ├── mcp.js                # MCP server management
│       ├── act-as-mcp.js         # DevBuddy as MCP server
│       ├── remote.js             # experimental remote-AI (SSH/Claude)
│       ├── commit.js             # conventional commit message from git diff
│       ├── review.js             # AI code review (streaming)
│       ├── doctor.js             # setup diagnostics (11 checks)
│       ├── history.js            # command history
│       ├── config.js             # settings management
│       ├── explain.js
│       ├── summarize.js
│       ├── todo.js
│       ├── translate.js
│       └── update.js             # manual update check
├── CHANGELOG.md
├── package.json
├── LICENSE
└── README.md
```

**Stats:** 56 files, ~6800 lines of source, 2 runtime deps (`chalk`, `commander`).
