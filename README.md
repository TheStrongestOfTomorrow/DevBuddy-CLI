# devbuddy

> A minimal AI-powered CLI that helps developers — ask questions, summarize files, explain code, translate text, and manage quick todos, all from the terminal.

Built with Node.js, Commander.js, and `z-ai-web-dev-sdk`. Subtle colors, zero clutter, friendly by default and scriptable when you need it.

---

## Install

> ⚠️ **Note: npm package not registered yet.**
> For now, install directly from GitHub. We'll publish to npm as `devbuddy` once the package name is reserved.

### Option A — Install globally from GitHub (recommended)

```bash
npm install -g TheStrongestOfTomorrow/DevBuddy-CLI
```

Then run from anywhere:

```bash
devbuddy --help
devbuddy ask "what is a closure?"
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

- **Node.js >= 18**
- A working `z-ai-web-dev-sdk` setup (the SDK handles credentials automatically in supported environments; no manual API key needed)

### Updating

```bash
npm update -g devbuddy      # once published to npm
# — or, while GitHub-only —
npm install -g TheStrongestOfTomorrow/DevBuddy-CLI
```

### Uninstalling

```bash
npm uninstall -g devbuddy   # if installed via npm link, also run `npm unlink -g devbuddy`
```

---

## Commands

### `devbuddy ask "<question>"`

Ask any question, get an AI answer in the terminal.

```bash
devbuddy ask "what's the difference between let and const in JS?"
devbuddy ask "how do I reverse a linked list in Python?" --thinking
devbuddy ask "explain CAP theorem" --system "You are a distributed systems professor."
devbuddy ask "what is 2 + 2" --json
```

Options:
- `-s, --system <prompt>` — override the system prompt
- `--thinking` — enable chain-of-thought (slower, deeper answers)
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
- `--json` — machine-readable output

### `devbuddy explain <file>`

Explain code in plain language.

```bash
devbuddy explain ./src/ai.js
devbuddy explain ./tricky.rs --level beginner
cat mystery.py | devbuddy explain - --level expert
```

Options:
- `--level <level>` — `beginner` | `intermediate` (default) | `expert`
- `--json` — machine-readable output

### `devbuddy translate "<text>"`

Translate text to another language.

```bash
devbuddy translate "hello world" --to zh
devbuddy translate "bonjour" --to en
devbuddy translate "good morning" -t es
```

Options:
- `-t, --to <lang>` — target language (defaults to `config.translateTo`)
- `--json` — machine-readable output

### `devbuddy todo`

Quick local todos with priorities. Stored at `~/.devbuddy/todos.json`.

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
devbuddy config get language
devbuddy config set language zh
devbuddy config set translateTo fr
devbuddy config set summarizeStyle tldr
devbuddy config reset
```

Known keys:
| key              | description                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| `language`       | Preferred output language for `ask` / `explain` / `summarize` (e.g. `en`, `zh`). |
| `translateTo`    | Default target language for `translate`.                                |
| `summarizeStyle` | `bullets` \| `paragraphs` \| `tldr` (default for `summarize`).          |
| `model`          | Informational only (SDK picks the default model).                       |

---

## Global flags

- `-v, --version` — print version
- `-h, --help` — show help (works on every command)
- `--no-color` — disable colored output
- `NO_COLOR=1` env var also disables color
- `--json` on AI commands — pipe-friendly output

## Files

- `~/.devbuddy/config.json` — settings
- `~/.devbuddy/todos.json`  — todos

## Examples

```bash
# Quick research loop
devbuddy ask "what's new in Node 22?" | devbuddy summarize - --style tldr

# Code review helper
devbuddy explain ./src/tricky-file.js --level expert

# Multilingual workflow
devbuddy translate "ship it!" --to ja

# Stay organized
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

## Project structure

```
DevBuddy-CLI/
├── bin/
│   └── devbuddy.js       # shebang entrypoint
├── src/
│   ├── index.js          # Commander setup, global flags
│   ├── ui.js             # minimal theme, spinner, storage paths
│   ├── ai.js             # z-ai-web-dev-sdk wrapper (retry, single instance)
│   ├── store.js          # config + todos persistence
│   └── commands/
│       ├── ask.js
│       ├── summarize.js
│       ├── explain.js
│       ├── translate.js
│       ├── todo.js
│       └── config.js
├── package.json
└── README.md
```
