# devbuddy

> A minimal AI-powered CLI that helps developers — **just run `devbuddy`** to launch a unified chat + agent REPL. Multi-provider, **MCP server support**, sub-agents, DEVBUDDY.md context, **experimental remote-AI (SSH/Claude Desktop)**, dual-channel auto-update. Inspired by Gemini CLI, Qwen CLI, OpenClaude, Hermes, Aider, Cline — still smaller than all of them.

[![Version](https://img.shields.io/badge/version-0.5.5-cyan)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](#)

---

## What's new in v0.5.5

- 🔌 **MCP server support** (`devbuddy mcp`) — connect to any Model Context Protocol server. Both stdio (local commands) and HTTP/SSE (remote) transports. MCP tools are auto-discovered and exposed to the agent as `mcp_<server>_<tool>`.
- 🧪 **Experimental remote-AI connector** (`devbuddy remote`) — for users without local API keys. Connect to a remote AI via SSH (any remote machine running `devbuddy-agent`) or Claude Desktop (local MCP). Gated by `experimentalRemoteAI: true` config.
- 🔧 **5 new agent tools** from other harnesses:
  - `grep_search` — search file contents with regex (from Hermes)
  - `web_fetch` — fetch a URL and return text (from Hermes)
  - `memory_update` — append to `.devbuddy/memory.md` (from Cline)
  - `git_diff` — show unstaged/staged git diff (from Aider)
  - `tree` — show directory tree, depth-limited (from Claude Code)
- 📜 **v0.5.5 update script** — `scripts/update-v0.5.5.sh` for the dual-channel auto-updater.

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
- An API key for one of the supported providers (HuggingFace and Groq have free tiers — recommended for trying it out)

---

## Quick start

```bash
# 1. Install (see above)

# 2. Onboard (one time, ~1 min)
devbuddy onboard

# 3. Just run devbuddy — launches unified chat + agent REPL
devbuddy
# > hello!                    # chat mode by default
# ai · Hi there! How can I help?
# > /agent                    # switch to agent mode
# [agent] > add a hello world route to app.js
# [agent] > /chat             # switch back to chat
# > /exit

# 4. Or launch directly in agent mode
devbuddy --agent

# 5. Add project context
devbuddy init         # creates DEVBUDDY.md template
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
devbuddy auth clear [provider]
```

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

v0.4 takes more from the open-source agentic harnesses we admire, while staying smaller than any of them:

**From OpenClaude:**
- ✅ Single-file agent core, tool registry as plain object
- ✅ Plain-text tool-call protocol (works with small models)

**From Hermes:**
- ✅ Provider abstraction (9 providers, one interface)

**From Aider (NEW in v0.4):**
- ✅ Auto-rollback on failure — mutations in a failed step are reverted
- ✅ Per-file backups recorded before each mutation

**From Cline (NEW in v0.4):**
- ✅ Planner mode — agent writes a plan first, then executes step-by-step
- ✅ Progress display between steps
- ✅ Project memory file (`.devbuddy/memory.md`)

**From Continue (NEW in v0.4):**
- ✅ `DEVBUDDY.md` project context (similar to `.continuerc.json`)
- ✅ Auto-discovery from CWD with home fallback

**What we still don't have (by design):**
- ❌ Sub-agents (we're one agent, one loop)
- ❌ Tree-of-thought planning (linear plans only)
- ❌ Vector embeddings / RAG (use `DEVBUDDY.md` instead)
- ❌ Multi-modal (text only)
- ❌ Plugin system (yet)

The core is still ~400 lines (up from ~200 in v0.3, but with 6× the features).

---

## Files

- `~/.devbuddy/config.json` — settings
- `~/.devbuddy/chats/<id>.json` — global chats
- `~/.devbuddy/DEVBUDDY.md` — global project context (fallback)
- `./.devbuddy/chats/<id>.json` — project-scoped chats
- `./.devbuddy/memory.md` — agent project memory
- `./DEVBUDDY.md` — project context (preferred)
- `~/.devbuddy/todos.json` — todos

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

---

## Roadmap

- [ ] Publish to npm as `devbuddy`
- [ ] Streaming responses (currently wait for full reply)
- [ ] `devbuddy commit` — generate commit messages from `git diff`
- [ ] `devbuddy review` — AI code review on a PR/diff
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
├── src/
│   ├── index.js              # entrypoint + auto-update wiring
│   ├── ui.js                 # minimal theme + spinner
│   ├── store.js              # config + todos persistence
│   ├── prompt.js             # DEVBUDDY.md loader (NEW)
│   ├── ai/
│   │   └── providers.js      # 9-provider adapter layer
│   ├── agent/
│   │   ├── core.js           # planner loop with auto-rollback + parallel reads
│   │   └── tools.js          # 8 tools with allowlist + rollback tracking
│   ├── chat/
│   │   └── store.js          # chat persistence (global + project scopes)
│   ├── updater/
│   │   └── updater.js        # GitHub release checker
│   └── commands/
│       ├── onboard.js
│       ├── init.js           # DEVBUDDY.md template (NEW)
│       ├── chat.js           # REPL + subcommands (NEW)
│       ├── ask.js
│       ├── auth.js
│       ├── agent.js          # + --allow, --plan flags
│       ├── config.js
│       ├── explain.js
│       ├── summarize.js
│       ├── todo.js
│       ├── translate.js
│       └── update.js
├── CHANGELOG.md
├── package.json
├── LICENSE
└── README.md
```
