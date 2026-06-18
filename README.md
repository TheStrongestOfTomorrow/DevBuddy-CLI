# devbuddy

> A minimal AI-powered CLI that helps developers — ask questions, summarize files, explain code, translate text, and manage quick todos, all from the terminal.

Built with Node.js, Commander.js, and the **HuggingFace Inference API** (free tier). Subtle colors, zero clutter, friendly by default and scriptable when you need it.

---

## ⚠️ Important: HuggingFace free tier

DevBuddy uses the **HuggingFace Inference API** for AI features. HuggingFace offers a **free tier** that anyone can sign up for — no credit card required.

**What you should know about the free tier:**
- 🆓 **Free to use** — get a token at https://huggingface.co/settings/tokens
- ⏱️ **Rate-limited** — typically ~1000 requests/month per user on the individual free tier
- 🐌 **Slower than paid APIs** — models may need to "warm up" on first call (10-30s)
- 🔄 **Shared infrastructure** — popular models may be temporarily unavailable during peak hours
- 💡 **Tip:** If you hit `429 Too Many Requests`, wait a minute or switch models via `devbuddy config set hfModel <name>`

This is a tradeoff for being free. For production / heavy use, consider upgrading at https://huggingface.co/pricing or swapping the base URL to another OpenAI-compatible provider (see [Advanced: Other providers](#advanced-other-providers)).

---

## Install

> ℹ️ **npm package not registered yet.** Install directly from GitHub for now.

### Option A — Install globally from GitHub (recommended)

```bash
npm install -g TheStrongestOfTomorrow/DevBuddy-CLI
```

### Option B — Clone and link manually

```bash
git clone https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI.git
cd DevBuddy-CLI
npm install
npm link        # makes `devbuddy` available on your PATH
```

### Option C — Run once without installing (npx-style)

```bash
npx github:TheStrongestOfTomorrow/DevBuddy-CLI ask "hello?"
```

### Requirements

- **Node.js >= 18** (uses native `fetch`)
- A free HuggingFace account to get an access token

---

## Quick start

```bash
# 1. Install (one of the options above)

# 2. Get a free HuggingFace token at:
#    https://huggingface.co/settings/tokens
#    (Create a "Read" token — that's all devbuddy needs)

# 3. Save your token
devbuddy auth set hf_your_token_here

# 4. Start using it
devbuddy ask "what's the difference between let and const?"
devbuddy summarize ./README.md
devbuddy explain ./src/ai.js
devbuddy translate "hello world" --to zh
devbuddy todo add "ship it" -p high
```

---

## Commands

### `devbuddy auth`

Manage your HuggingFace access token.

```bash
devbuddy auth                          # show status
devbuddy auth set hf_xxx               # save + verify token
devbuddy auth set hf_xxx --no-verify   # save without verifying
devbuddy auth status                   # show masked token + current model
devbuddy auth verify                   # re-verify saved token
devbuddy auth models                   # list known free HF chat models
devbuddy auth clear                    # remove the saved token
```

Token is stored at `~/.devbuddy/config.json`. You can also set it via the `HF_TOKEN` (or `HUGGINGFACE_TOKEN`) environment variable.

### `devbuddy ask "<question>"`

Ask any question, get an AI answer in the terminal.

```bash
devbuddy ask "what's the difference between let and const in JS?"
devbuddy ask "how do I reverse a linked list in Python?" --model Qwen/Qwen2.5-7B-Instruct
devbuddy ask "explain CAP theorem" --system "You are a distributed systems professor."
devbuddy ask "what is 2 + 2" --json
```

Options:
- `-s, --system <prompt>` — override the system prompt
- `-m, --model <name>` — override the HuggingFace model for this call
- `--max-tokens <n>` — max output tokens (default 1024)
- `--json` — machine-readable output

### `devbuddy summarize <file>`

Condense a file (or stdin) into key points.

```bash
devbuddy summarize README.md
devbuddy summarize ./notes.txt --style tldr
devbuddy summarize ./report.md --style paragraphs --max 3
cat long-log.txt | devbuddy summarize - --style bullets
```

Options:
- `-s, --style <style>` — `bullets` (default) | `paragraphs` | `tldr`
- `--max <n>` — max number of bullets (default 5)
- `-m, --model <name>`, `--max-tokens <n>`, `--json`

### `devbuddy explain <file>`

Explain code in plain language.

```bash
devbuddy explain ./src/ai.js
devbuddy explain ./tricky.rs --level beginner
cat mystery.py | devbuddy explain - --level expert
```

Options:
- `--level <level>` — `beginner` | `intermediate` (default) | `expert`
- `-m, --model <name>`, `--max-tokens <n>`, `--json`

### `devbuddy translate "<text>"`

Translate text to another language.

```bash
devbuddy translate "hello world" --to zh
devbuddy translate "bonjour" --to en
devbuddy translate "good morning" -t es
```

Options:
- `-t, --to <lang>` — target language (defaults to `config.translateTo`)
- `-m, --model <name>`, `--max-tokens <n>`, `--json`

### `devbuddy todo`

Quick local todos with priorities. Stored at `~/.devbuddy/todos.json`. Works **offline** — no AI needed.

```bash
devbuddy todo                         # list (open first, then done)
devbuddy todo add "fix the bug" -p high
devbuddy todo add "write docs"
devbuddy todo done 1
devbuddy todo undo 1
devbuddy todo rm 2
devbuddy todo clear                   # remove all completed todos
devbuddy todo list --open             # only open
devbuddy todo list --done             # only done
```

Priorities: `high`, `medium` (default), `low`.

### `devbuddy config`

Persistent settings stored at `~/.devbuddy/config.json`.

```bash
devbuddy config                       # show all
devbuddy config list
devbuddy config get hfModel
devbuddy config set hfModel Qwen/Qwen2.5-7B-Instruct
devbuddy config set language zh
devbuddy config set translateTo fr
devbuddy config set summarizeStyle tldr
devbuddy config reset
```

Known keys:
| key              | description                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `hfToken`        | HuggingFace access token. Set via `devbuddy auth set` (masked in `config list`).                  |
| `hfModel`        | HuggingFace chat model (default: `mistralai/Mistral-7B-Instruct-v0.3`).                          |
| `hfBaseUrl`      | HuggingFace API base URL (default: `https://router.huggingface.co/v1`).                          |
| `language`       | Preferred output language for `ask` / `explain` / `summarize` (e.g. `en`, `zh`).                  |
| `translateTo`    | Default target language for `translate`.                                                          |
| `summarizeStyle` | `bullets` \| `paragraphs` \| `tldr` (default for `summarize`).                                    |

---

## Global flags

- `-v, --version` — print version
- `-h, --help` — show help (works on every command)
- `--no-color` — disable colored output
- `NO_COLOR=1` env var also disables color
- `--json` on AI commands — pipe-friendly output

## Files

- `~/.devbuddy/config.json` — settings (including your HF token)
- `~/.devbuddy/todos.json`  — todos

---

## Advanced: Other providers

Because HuggingFace's API is OpenAI-compatible, you can point devbuddy at any other OpenAI-compatible endpoint by setting `hfBaseUrl`:

```bash
# Example: use OpenAI directly (note: requires an OpenAI key, NOT a HF key)
devbuddy config set hfBaseUrl https://api.openai.com/v1
devbuddy auth set sk-your-openai-key
devbuddy config set hfModel gpt-4o-mini

# Example: use a local Ollama server
devbuddy config set hfBaseUrl http://localhost:11434/v1
devbuddy auth set dummy-local-no-auth-needed
devbuddy config set hfModel llama3.2
```

This is unsupported / experimental — your mileage may vary.

---

## Known free HuggingFace chat models

Run `devbuddy auth models` to see the current list. As of v0.2.0:

- `mistralai/Mistral-7B-Instruct-v0.3` (default — fast, capable)
- `meta-llama/Meta-Llama-3-8B-Instruct`
- `Qwen/Qwen2.5-7B-Instruct` (strong on code)
- `HuggingFaceH4/zephyr-7b-beta` (friendly chat)
- `google/gemma-2-2b-it` (lightweight)

Browse all available models at https://huggingface.co/models?inference=warm&sort=trending

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `No HuggingFace token set` | First run | `devbuddy auth set hf_xxx` |
| `HuggingFace rate limit hit (429)` | Free tier quota exceeded | Wait, or switch models, or upgrade |
| `HuggingFace rejected your token (HTTP 401)` | Bad/expired token | Re-create at https://huggingface.co/settings/tokens |
| `Model 'X' not found` | Wrong model name or unavailable | `devbuddy auth models` for known good ones |
| `Empty response from model` | Model returned nothing | Try a different model or rephrase |

---

## Examples

```bash
# Quick research loop
devbuddy ask "what's new in Node 22?" | devbuddy summarize - --style tldr

# Code review helper
devbuddy explain ./src/tricky-file.js --level expert

# Multilingual workflow
devbuddy translate "ship it!" --to ja

# Stay organized (offline)
devbuddy todo add "review PR #42" -p high
devbuddy todo add "reply to standup" -p medium
devbuddy todo done 1
```

## Roadmap

- [ ] Publish to npm as `devbuddy`
- [ ] `devbuddy chat` — multi-turn interactive sessions
- [ ] `devbuddy ask --file <path>` — attach file context to a question
- [ ] `devbuddy refactor <file>` — AI-assisted code refactoring
- [ ] `devbuddy commit` — generate conventional commit messages from `git diff`
- [ ] Streaming responses (currently we wait for the full reply)
- [ ] Plugin system for custom commands

## Contributing

PRs welcome! Fork the repo, create a feature branch, and open a pull request against `main`.

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
│   └── devbuddy.js       # shebang entrypoint
├── src/
│   ├── index.js          # Commander setup, global flags
│   ├── ui.js             # minimal theme, spinner, storage paths
│   ├── ai.js             # HuggingFace Inference API client (retry, rate-limit handling)
│   ├── store.js          # config + todos persistence
│   └── commands/
│       ├── ask.js
│       ├── auth.js       # token set/get/verify/clear/models
│       ├── config.js
│       ├── explain.js
│       ├── summarize.js
│       ├── todo.js
│       └── translate.js
├── CHANGELOG.md
├── package.json
├── LICENSE
└── README.md
```
