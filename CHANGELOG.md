# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
