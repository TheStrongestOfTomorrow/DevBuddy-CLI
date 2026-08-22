# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] — 2026-08-22

### Changed

- Configured DevBuddy as the scoped `@thestrongestoftomorrow/devbuddy` package for GitHub Packages.
- Added `publishConfig` for the GitHub npm registry.
- Added automated patch/minor/major versioning, tagging, testing, and GitHub Packages publishing through GitHub Actions.
- Release automation avoids recursive release commits.

---

## [1.1.3] — 2026-06-20

### Added

- Thinking mode toggle in the chat REPL and `devbuddy ask --thinking`.
- Thinking status in `/mode` and slash-command suggestions.

---

## [1.1.2] — 2026-06-20

### Hotfix

- Added configurable Shizuku `rish` path for phone control.
- Added `scripts/update-v1.1.2.sh`.

---

## [1.1.1] — 2026-06-20

### Hotfix

- Increased GitHub API updater timeout and added retries.
- Added `devbuddy update --force-install`.
- Added `scripts/update-v1.1.1.sh`.

---

## [1.1.0] — 2026-06-20

### Added

- Experimental Android phone control through ADB/Shizuku with an Ollama-only safety gate.
- Phone tools, `devbuddy phone`, and `--phone` support.
- Added `scripts/update-v1.1.0.sh`.

---

## [1.0.1] — 2026-06-19

### Hotfix

- Added custom model IDs during onboarding.
- Added `devbuddy auth model [name]`.
- Refactored model picking and updated auth help.

---

## [1.0.0] — 2026-06-19

### Added

- DevBuddy as an MCP server with SSE and stdio transports.
- Streaming AI responses.
- Ollama support without an API key.
- `commit`, `review`, `doctor`, and `history` commands.
- Theme support and new configuration keys.
- Tagged updater and package manifest support.

---

## [0.5.5] — 2026-06-19

### Added

- MCP client support with stdio/HTTP-SSE transports and automatic tool discovery.
- Experimental SSH and Claude Desktop remote-AI connectors.
- `grep_search`, `web_fetch`, `memory_update`, `git_diff`, and `tree` agent tools.

---

## [0.5.1] — 2026-06-19

### Added

- Unified chat + agent REPL.
- `/agent`, `/chat`, `/mode`, `--agent`, and `--yolo` support.

### Changed

- `devbuddy` now launches the unified REPL by default.

---

## [0.5.0] — 2026-06-19

### Added

- Inline auto-suggest for slash commands, files, and history.
- Sub-agents and multi-key provider onboarding.
- `auth add` and `auth switch`.
- Dual-channel auto-update and per-version update/package manifests.
- `/reset`, `/agents`, and `/cost`.

---

## [0.4.0] — 2026-06-18

### Added

- Persistent multi-message chat and chat branching/export.
- `DEVBUDDY.md` project context and `devbuddy init`.
- Per-session directory grants, planner mode, auto-rollback, parallel reads, project memory, and `glob_search`.

---

## [0.3.0] — 2026-06-18

### Added

- Agentic harness with file and shell tools.
- Nine AI providers and interactive onboarding.
- Onboarding gate, automatic updates, safety guards, model/token flags, token masking, and config migration.

---

## [0.2.0] — 2026-06-18

### Breaking

- Replaced the unusable Z.ai sandbox SDK with the public HuggingFace Inference API.

### Added

- Provider-aware auth commands, rate-limit handling, model/token flags, token masking, and troubleshooting documentation.

---

## [0.1.0] — 2026-06-18

### Added

- Initial DevBuddy CLI release with `ask`, `summarize`, `explain`, `translate`, `todo`, and `config`.
- Minimal CLI theme, spinner, persistent config/todos, JSON output, and `NO_COLOR` support.

### Known issue

- The initial release depended on `z-ai-web-dev-sdk`; this was fixed in v0.2.0.
