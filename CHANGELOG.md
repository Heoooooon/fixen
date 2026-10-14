# Changelog

All notable changes to `fixen-cli` are listed here. Versions follow [semver](https://semver.org/); before 1.0, minor versions may add features and change defaults.

## 0.2.0 — unreleased

### Added
- **Sidecar notifications**: `fixen --notify` corrects your own prose and shows a desktop notification only when something changed. `--hook` turns an AI CLI's prompt-submit hook JSON into a detached `--notify` job, so the agent is never delayed. `--last`, `--copy`, `--ask`, and `--clear` work with the saved correction; `--json` prints it for integrations.
- **Polish mode**: `fixen --polish` corrects text meant for a human reader, shows what changed, and copies the result to the clipboard.
- **History dashboard**: `fixen --gui [--port <n>]` serves a local correction-history dashboard on 127.0.0.1. One-shot, stdin, interactive, polish, and Senpi chat corrections are recorded in a capped `history.jsonl` (`FIXEN_NO_HISTORY=1` opts out). The dashboard can also run corrections and pick the backend, model, and API provider.
- **Global hotkey (macOS)**: `fixen hotkey` installs a "Fix with fixen" quick action (default ⌃⌥⌘F) that replaces the selected text in any app with the corrected text.
- **`fixen doctor`** checks the backend, storage, clipboard, and notifications.
- **`openai` backend** for OpenAI `/responses` reasoning models, with `-r, --reasoning` / `FIXEN_REASONING`. `-m` now also applies to `codex`.
- New environment variables: `FIXEN_BACKEND_TIMEOUT`, `FIXEN_SIDECAR_TIMEOUT`, `FIXEN_CORRECTION_TTL`, `FIXEN_SIDECAR_NO_STORE`, `FIXEN_NOTIFY_DISABLE`, `FIXEN_NOTIFY_ICON`, `FIXEN_NOTIFY_IGNORE_DND`, `FIXEN_GUI_NO_OPEN`, `FIXEN_HOTKEY_NO_REGISTER`.

### Changed
- `fixen uninstall` also removes the hotkey.
- `fixen -- <words>` now means "never read these as options".
- The macOS menu bar app moved to a separate repository; this package ships the CLI engine only.

### Security
- `credentials.json` is repaired to mode `0600` on read and always rewritten as `0600`.
- Atomic writes refuse to replace a dangling instruction-file symlink.
- The dashboard will not point a stored API key at a different API URL unless the key is entered again.
- `fixen doctor` recognizes API keys saved by the dashboard, not only environment variables.
- `fixen update` validates the registry's version string, installs exactly the version it checked (not `@latest` a second time), and passes the same registry to the package manager.

## 0.1.8 — 2026-07-29

- Hardened release; see the [v0.1.8 commit](https://github.com/Heoooooon/fixen/commit/0089942) for details.
