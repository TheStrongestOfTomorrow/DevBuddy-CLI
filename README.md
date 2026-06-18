# devbuddy

> A minimal AI-powered CLI that helps developers — multi-provider AI, agentic harness, auto-update, and a clean onboarding flow. Built to be the **smallest useful agentic CLI** — inspired by OpenClaude and Hermes, stripped to essentials.

[![Version](https://img.shields.io/badge/version-0.3.0-cyan)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](#)

---

## What's new in v0.3.0

- 🤖 **Agentic harness** (`devbuddy agent`) — read/write/edit files, run shell commands. Off by default; toggle on with `devbuddy agent toggle`.
- 🌐 **9 providers** — HuggingFace (free), OpenAI, Anthropic, Groq (free), OpenRouter, Ollama (local), Together (free), Mistral, Cohere.
- 🚀 **`devbuddy onboard`** — interactive setup wizard. **Required** before any AI command works.
- 🔄 **Auto-update** — checks GitHub on launch, prompts before installing.
- 🔒 **Safety guards** — agent can't access files outside CWD; mutating actions prompt for confirmation (use `--yolo` to skip).

See [CHANGELOG.md](./CHANGELOG.md) for the full diff.

---

## Install

> ℹ️ **npm package not registered yet.** Install directly from GitHub.

### Option A — Install globally from GitHub (recommended)

```bash
npm install -g TheStrongestOfTomorrow/DevBuddy-CLI
```

### Option B — Clone and link manually

```bash
git clone https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI.git
cd DevBuddy-CLI
npm install
npm link
```

### Requirements

- **Node.js >= 18** (uses native `fetch`)
- An API key for one of the supported providers (HuggingFace and Groq have free tiers — recommended for trying it out)

---

## Quick start

```bash
# 1. Install (see above)

# 2. Run the onboarding wizard
devbuddy onboard
# → pick a provider, paste your API key, pick a model, done.

# 3. Use it
devbuddy ask "what's the difference between let and const?"
devbuddy summarize ./README.md
devbuddy explain ./src/index.js
devbuddy translate "hello world" --to zh

# 4. Try the agent (off by default — toggle on first)
devbuddy agent toggle
devbuddy agent run "add a hello world route to my app.js"

# 5. Manage todos (offline, no AI needed)
devbuddy todo add "ship it" -p high
```

**If you skip onboarding**, AI commands refuse with a friendly error:

```
error: DevBuddy is not onboarded yet.
  Run: devbuddy onboard
  (one-time setup, ~1 minute)
```

---

## Providers

| Provider | Free? | Signup | Notes |
|----------|-------|--------|-------|
| HuggingFace | ✅ | https://huggingface.co/join | ~1000 req/month, models may warm up |
| OpenAI | ❌ | https://platform.openai.com/signup | gpt-4o-mini is ~$0.15/M in |
| Anthropic | ❌ | https://console.anthropic.com/ | Best for code; claude-3.5-sonnet |
| Groq | ✅ | https://console.groq.com/ | Ultra-fast (500+ tok/s) |
| OpenRouter | ❌ | https://openrouter.ai/ | One key, 200+ models |
| Ollama | ✅ | https://ollama.com/download | Local, fully offline |
| Together | ✅ | https://api.together.ai/ | $5 free credits, Llama-3.3-70B |
| Mistral | ❌ | https://console.mistral.ai/ | Official Mistral API |
| Cohere | ❌ | https://dashboard.cohere.com/ | Strong on RAG |

Switch providers any time:

```bash
devbuddy onboard --force     # re-run the wizard
# — or —
devbuddy auth set <key> --provider groq
devbuddy config set provider groq
```

---

## Commands

### `devbuddy onboard`
Interactive setup wizard. **Required** before any AI command. ~1 minute.

```bash
devbuddy onboard              # first run
devbuddy onboard --force      # re-run
devbuddy onboard --skip-test  # skip the connection test
```

### `devbuddy ask "<question>"`
Ask any question.

```bash
devbuddy ask "what is a closure in JS?"
devbuddy ask "explain CAP theorem" --system "You are a distributed systems professor."
devbuddy ask "what is 2 + 2" --json
devbuddy ask "use gpt-4o" --model gpt-4o
```

Options: `-s, --system`, `-m, --model`, `--max-tokens`, `--json`

### `devbuddy summarize <file>`
Condense a file (or stdin) into key points.

```bash
devbuddy summarize README.md
devbuddy summarize ./notes.txt --style tldr
cat long-log.txt | devbuddy summarize - --style bullets
```

Options: `-s, --style` (bullets|paragraphs|tldr), `--max`, `-m, --model`, `--max-tokens`, `--json`

### `devbuddy explain <file>`
Explain code in plain language.

```bash
devbuddy explain ./src/index.js
devbuddy explain ./tricky.rs --level beginner
```

Options: `--level` (beginner|intermediate|expert), `-m, --model`, `--max-tokens`, `--json`

### `devbuddy translate "<text>"`
Translate text.

```bash
devbuddy translate "hello world" --to zh
devbuddy translate "bonjour" --to en
```

Options: `-t, --to`, `-m, --model`, `--max-tokens`, `--json`

### `devbuddy agent` (NEW in v0.3)
Agentic harness — can read, write, edit files and run shell commands to complete a task.

**Off by default.** Toggle on first:

```bash
devbuddy agent toggle          # enable
devbuddy agent status          # show current config
devbuddy agent run "<task>"    # run the agent
devbuddy agent toggle --off    # disable
```

Examples:

```bash
devbuddy agent run "add a hello world route to app.js"
devbuddy agent run "rename all .js files in src/ to .ts and update imports"
devbuddy agent run "find any TODO comments in the codebase and list them"
devbuddy agent run "fix the failing test" --yolo        # skip confirms (DANGEROUS)
devbuddy agent run "refactor this" --max-steps 30       # default 20
devbuddy agent run "use claude" --model claude-3-5-sonnet-20241022
```

**Safety:**
- Agent is constrained to your current working directory. It cannot access files outside CWD.
- Mutating actions (`write_file`, `edit_file`, `run_shell`) prompt for confirmation by default.
- Use `--yolo` (or `devbuddy config set agentYolo true`) to skip confirms. **Dangerous.**
- Shell commands time out after 30 seconds.

**Tools available to the agent:**
- `read_file` — read a file's contents
- `write_file` — write a new file (or overwrite)
- `edit_file` — find-and-replace in an existing file (refuses non-unique matches)
- `list_files` — list a directory
- `run_shell` — execute a shell command
- `finish` — signal task complete

### `devbuddy auth`
Manage API keys across all providers.

```bash
devbuddy auth                              # status
devbuddy auth status                       # detailed status
devbuddy auth providers                    # list all supported providers
devbuddy auth set <key>                    # set key for active provider
devbuddy auth set <key> --provider groq    # set key + switch to groq
devbuddy auth clear                        # clear active provider's key
devbuddy auth clear openai                 # clear a specific provider's key
```

### `devbuddy todo`
Quick local todos with priorities. **Offline — no AI needed.**

```bash
devbuddy todo                              # list
devbuddy todo add "fix the bug" -p high
devbuddy todo done 1
devbuddy todo undo 1
devbuddy todo rm 2
devbuddy todo clear
devbuddy todo list --open
```

### `devbuddy config`
Persistent settings at `~/.devbuddy/config.json`.

```bash
devbuddy config                            # show all
devbuddy config list
devbuddy config set language zh
devbuddy config set agentEnabled true
devbuddy config set autoUpdate silent      # off | prompt | silent
devbuddy config reset
```

Known keys:
| key | description |
|-----|-------------|
| `provider` | Active provider ID (huggingface, openai, anthropic, groq, ...) |
| `language` | Output language for ask/explain/translate |
| `translateTo` | Default target language for `translate` |
| `summarizeStyle` | bullets \| paragraphs \| tldr |
| `agentEnabled` | true/false — master toggle for agentic mode |
| `agentYolo` | true/false — skip agent confirms (DANGEROUS) |
| `agentMaxSteps` | Max tool-call steps per agent run (default 20) |
| `autoUpdate` | off \| prompt \| silent (default: prompt) |
| `onboardingComplete` | true/false — whether onboarding has been completed |

### `devbuddy update` (NEW in v0.3)
Manually check for and install updates.

```bash
devbuddy update           # check + install
devbuddy update --check   # check only, don't install
```

Auto-update behavior is controlled by `config.autoUpdate`:
- `prompt` (default) — check on launch, ask Y/n before installing
- `silent` — check on launch, install without asking
- `off` — never check

---

## Global flags

- `-v, --version` — print version
- `-h, --help` — show help (works on every command)
- `--no-color` — disable colored output
- `NO_COLOR=1` env var also disables color
- `--json` on AI commands — pipe-friendly output

## Files

- `~/.devbuddy/config.json` — settings (including API keys)
- `~/.devbuddy/todos.json`  — todos

---

## How the agentic harness works (design notes)

DevBuddy's agent is intentionally minimal — about 200 lines of core logic. We studied several open-source agentic harnesses and took only the parts that mattered:

**From [OpenClaude](https://github.com/anthropics/anthropic-cookbook):**
- ✅ Single-file agent core, tool-use loop
- ✅ Tool registry as a plain object (not a class hierarchy)
- ❌ Skipped: complex planning trees, sub-agents

**From Hermes Agent (and similar):**
- ✅ Provider abstraction (9 providers, one chat-completions interface)
- ✅ Plain-text tool-call protocol (works across all model sizes)
- ❌ Skipped: chain-of-thought trees, memory systems

**What we kept that they didn't have:**
- ✅ Onboarding gate — refuses to run AI commands until configured
- ✅ CWD-only file access (no path traversal)
- ✅ Per-action confirmation prompts (with `--yolo` escape hatch)
- ✅ Truncation of large tool results to keep history manageable
- ✅ Auto-update on launch (non-blocking)

The tool-call format is plain text instead of JSON-only:
```
TOOL: read_file
{"path": "src/index.js"}
END_TOOL
```

Why? Because smaller models (especially the free ones from HuggingFace/Groq) are unreliable at pure-JSON output. The plain-text format with explicit delimiters works across every provider we tested.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `DevBuddy is not onboarded yet` | First run | `devbuddy onboard` |
| `No API key set for X` | Key missing or cleared | `devbuddy auth set <key>` |
| `rate limit hit (429)` | Free tier quota exceeded | Wait, switch models, or switch providers |
| `rejected your API key (HTTP 401)` | Bad/expired key | Re-create at provider's site, re-run `devbuddy onboard --force` |
| `Model 'X' not found` | Wrong model name | `devbuddy auth providers` to see known good ones |
| `Agent mode is currently OFF` | Trying to use agent without enabling | `devbuddy agent toggle` |
| `Refusing to access path outside CWD` | Agent tried to escape your project | This is intentional. Run devbuddy from your project root. |

---

## Roadmap

- [ ] Publish to npm as `devbuddy`
- [ ] Streaming responses (currently we wait for the full reply)
- [ ] `devbuddy chat` — multi-turn interactive sessions
- [ ] `devbuddy agent` with file-context awareness (auto-scan project structure)
- [ ] `devbuddy commit` — generate conventional commit messages from `git diff`
- [ ] Plugin system for custom tools

## Contributing

PRs welcome! Fork the repo, create a feature branch, open a pull request against `main`.

```bash
git clone https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI.git
cd DevBuddy-CLI
npm install
node bin/devbuddy.js --help    # smoke test
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
│   ├── ai/
│   │   └── providers.js      # 9-provider adapter layer
│   ├── agent/
│   │   ├── core.js           # planner loop (~200 lines)
│   │   └── tools.js          # read/write/edit/list/shell/finish
│   ├── updater/
│   │   └── updater.js        # GitHub release checker
│   └── commands/
│       ├── onboard.js        # interactive setup wizard
│       ├── ask.js
│       ├── auth.js
│       ├── agent.js
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
