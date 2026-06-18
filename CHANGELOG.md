# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-06-18

### ⚠️ Breaking

- **Switched AI backend from `z-ai-web-dev-sdk` to the HuggingFace Inference API.**
  - v0.1.0 relied on `z-ai-web-dev-sdk`, which is an internal Z.ai sandbox SDK that
    cannot be used outside the Z.ai sandbox environment. This made the published v0.1.0
    non-functional for any real user.
  - v0.2.0 fixes this: devbuddy now uses the **HuggingFace Inference API**, which is
    free and accessible to anyone with a HuggingFace account.
- Removed the `z-ai-web-dev-sdk` dependency. Devbuddy now has only two runtime deps
  (`chalk`, `commander`) and uses native `fetch` (Node 18+).
- Removed `config.model` (was unused). Replaced with `config.hfModel`.

### Added

- New `devbuddy auth` command with subcommands: `set`, `status`, `verify`, `clear`, `models`.
- Rate-limit awareness: devbuddy prints a one-time warning about HuggingFace's free-tier
  limits on first run, and surfaces `429` errors with a clear, actionable message.
- `--model` flag on `ask`, `summarize`, `explain`, `translate` to override the model
  per-call.
- `--max-tokens` flag on AI commands.
- Token masking in `config list` and `auth status` (e.g. `hf_abcd…wxyz`).
- Graceful token verification: if `auth set` can't verify the token (e.g. shared IP
  rate limits), the token is still saved with a warning.
- "Other providers" docs section — since HF is OpenAI-compatible, users can repoint
  devbuddy at OpenAI, Ollama, OpenRouter, etc. via `config set hfBaseUrl`.
- Troubleshooting table in README.
- This `CHANGELOG.md`.

### Changed

- `src/ai.js` rewritten from scratch — no more SDK wrapper, just direct HTTP calls
  to `https://router.huggingface.co/v1/chat/completions`.
- Default model is now `mistralai/Mistral-7B-Instruct-v0.3` (free, capable).
- README rewritten with prominent free-tier warning and full quick-start guide.
- Help text now mentions `devbuddy auth set` as the first-run command.

### Removed

- `z-ai-web-dev-sdk` runtime dependency.
- `config.model` key (replaced by `config.hfModel`).

---

## [0.1.0] — 2026-06-18

### ⚠️ Known issue (fixed in 0.2.0)

v0.1.0 was published with a dependency on `z-ai-web-dev-sdk`, which only works
inside the Z.ai sandbox. Real users could not use any AI command. This was a
mistake — apologies. Fixed in v0.2.0 by switching to HuggingFace.

### Added

- Initial release.
- Commands: `ask`, `summarize`, `explain`, `translate`, `todo`, `config`.
- Minimal ripgrep-style theme with subtle colors.
- Zero-dep spinner.
- Persistent config + todos under `~/.devbuddy/`.
- `--json` output on AI commands, `--no-color` / `NO_COLOR` support.
