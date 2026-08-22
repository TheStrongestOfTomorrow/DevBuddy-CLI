# Changelog

All notable changes to this project will be documented here.

## [1.1.5] — 2026-08-22

### Changed

- Automated release build.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] — 2026-08-22

### Changed

- Configured DevBuddy as the scoped `@thestrongestoftomorrow/devbuddy` package for GitHub Packages publishing.
- Added `publishConfig` for the GitHub npm registry.
- Added automated release/versioning workflow for patch, minor, and major releases.
- Releases are tagged automatically as `v<version>` and published to GitHub Packages after tests pass.

---

## [1.1.3] — 2026-06-20

### Added

- **Thinking mode toggle** in the chat REPL. `/thinking` turns it on/off. When on, the system prompt includes "Think step-by-step before answering. Show your reasoning, then give the final answer." When off (default), direct answers.
- **`devbuddy ask --thinking`** flag for one-shot use.
- `summarize`, `explain`, `translate` stay **no-thinking by default** (direct answers, no step-by-step).
- Welcome banner shows `+ thinking` when thinking mode is on.
- `/mode` shows thinking status.
- `/thinking` added to slash command auto-suggest list.

---
