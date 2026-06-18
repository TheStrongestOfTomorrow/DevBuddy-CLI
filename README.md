# devbuddy

> A minimal AI-powered CLI that helps developers — multi-provider AI, persistent multi-message chat, agentic harness with planner mode + project memory, DEVBUDDY.md project context, scoped directory access, and auto-update. Inspired by OpenClaude, Hermes, Aider, and Cline — but still smaller than all of them.

[![Version](https://img.shields.io/badge/version-0.4.0-cyan)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](#)

---

## What's new in v0.4.0

- 💬 **Multi-message chat** (`devbuddy chat`) — interactive REPL with persistent storage, slash commands, branching, and Markdown export. Global + per-project scopes.
- 📝 **`DEVBUDDY.md` project context** — drop a `DEVBUDDY.md` in your project root and every AI command (ask, summarize, explain, translate, chat, agent) automatically includes it in the system prompt. Run `devbuddy init` to create a template.
- 🎯 **Per-session directory grants** (`devbuddy agent run --allow <dir>`) — agent can be granted access to directories beyond CWD on a per-run basis.
- 🧠 **Planner mode** (`devbuddy agent run --plan`) — agent writes a plan first, then executes step-by-step with progress display.
- 🔄 **Auto-rollback** — if a tool fails mid-step, all mutations from that step are automatically rolled back.
- ⚡ **Parallel reads** — agent can call multiple read-only tools (read_file, list_files, glob_search) in a single turn.
- 💾 **Project memory** — agent reads `.devbuddy/memory.md` at the start of each run to remember what it did last time in this project.
- 🔍 **`glob_search` tool** — agent can find files by pattern without running shell.

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

# 3. Try the new chat
devbuddy chat
# > hello!
# ai · Hi there! How can I help?
# > /exit

# 4. Add project context
devbuddy init         # creates DEVBUDDY.md template
# edit it to describe your project

# 5. Use the agent (off by default)
devbuddy agent toggle
devbuddy agent run "add a hello world route to app.js"
devbuddy agent run --plan "refactor the auth module into its own folder"
devbuddy agent run --allow ../shared-lib "use the shared logger in src/"
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
