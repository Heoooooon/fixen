# fixen

**Fix your English (or any language) from the command line, with the LLM you already have.**

[![npm](https://img.shields.io/npm/v/fixen-cli)](https://www.npmjs.com/package/fixen-cli)
[![CI](https://github.com/Heoooooon/fixen/actions/workflows/ci.yml/badge.svg)](https://github.com/Heoooooon/fixen/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![deps](https://img.shields.io/badge/dependencies-0-orange)

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

<p align="center">
  <img src="docs/assets/demo.gif" alt="Screen recording of fixen 0.2.0. In the terminal, fixen --polish lists each change and prints the corrected English and Korean sentences. In TextEdit, a selected sentence is replaced in place after pressing Control-Option-Command-F." width="860">
</p>

<p align="center"><sub>Real recording of fixen 0.2.0 (model wait time trimmed) · <a href="docs/assets/demo.mp4">MP4 version</a></sub></p>

## Quick start

```sh
npm install -g fixen-cli    # installs the `fixen` command (Node.js ≥ 18)
fixen doctor                # checks backend, storage, clipboard, and notifications
```

Then try it:

```sh
fixen "I has a apple"                                 # → I have an apple.
fixen -e -l Korean "She go to school yesterday"       # also explain the fixes, in Korean
fixen -t Japanese "私は昨日学校に行きたです"            # correct any language, not just English
```

You need at least one [backend](#pick-a-backend) — if you can run `claude`, `codex`, `gjc`, `gemini`, or `ollama` in a terminal, you're done.

## Three ways to use it

### 1. In the terminal

```sh
fixen "your english sentence"       # one-shot
echo "your sentence" | fixen        # stdin / pipes
fixen --polish "draft message"      # fix a message for humans: show the diff, copy to clipboard
```

### 2. Anywhere on macOS: the global hotkey

```sh
fixen hotkey
```

Select text in any app — Slack, Mail, a browser textarea — press **⌃⌥⌘F**, and the corrected text **replaces the selection in place**. [Details](#global-hotkey-macos)

### 3. Inside your AI chat: automatic corrections

```sh
fixen install
```

Every normal reply from your AI chat CLI now ends with a correction of what *you* typed:

```console
$ gjc -p "hey what is capital of france? my dream is go to paris someday"
The capital of France is Paris. ...

> **fixen** · My dream is **to** go to Paris someday.
> ↳ '가다'는 to부정사로 — go → to go
```

[Details](#chat-mode-corrections-inside-your-ai-cli)

## Pick a backend

Auto-detected in this order: `claude` → `codex` → `gjc` → `gemini` → `ollama` → `api` (if an API key is set). Pick one explicitly with `-b`.

| Backend  | What you need | Best when |
| -------- | ------------- | --------- |
| `claude` | Claude Code signed in (`claude -p`) | You already pay for Claude |
| `codex`  | OpenAI Codex CLI signed in (`codex exec`; `-m` works) | You already use ChatGPT / Codex |
| `gjc`    | GJC installed (`gjc -p --no-tools`, selectable models) | You already use GJC |
| `gemini` | Gemini CLI signed in (`gemini -p`) | You want a free-tier cloud model |
| `ollama` | A local model (`ollama run <model>`) | You want local and offline |
| `api`    | `FIXEN_API_KEY` (+ `FIXEN_API_URL`, `FIXEN_MODEL`) for any OpenAI-compatible `/chat/completions` | DeepSeek, Groq, OpenRouter, OpenAI, or your own server |
| `openai` | `FIXEN_API_KEY` and `-m` for OpenAI `/responses` | Reasoning models such as `gpt-5.6-pro` |
| `-c`     | Any command that reads a prompt and prints an answer | Anything else |

[Backend details](#backends)

## Why fixen

- **Bring your own model, zero dependencies.** One small CLI with no `node_modules` that pipes a correction prompt into whatever is on your machine — no accounts, no API keys unless you want one, no vendor lock-in.
- **Learn while you work.** Chat mode turns every message you type into a free micro-lesson, without opening a single flashcard app.
- **Any language, fully reversible.** English by default, `-t` corrects Japanese, French, German, anything; `fixen uninstall` puts every touched file back exactly as it was.

## Privacy

- Your text goes **only to the backend you pick**. fixen has no server of its own, so nothing is sent anywhere else.
- History stays **on your machine** (`~/.config/fixen/history.jsonl`, mode `0600`). Turn it off with `FIXEN_NO_HISTORY=1`; keep sidecar results out with `FIXEN_SIDECAR_NO_STORE=1`.
- API keys saved from the dashboard live in `~/.config/fixen/credentials.json` (`0600`), never in `config.json`. The `openai` backend sends `store: false`.

## Reference

<details>
<summary><b>All commands and options</b></summary>

### Commands

```sh
fixen "your english sentence"       # one-shot
echo "your sentence" | fixen        # stdin / pipes
fixen                               # interactive mode (type lines, Ctrl+D to quit)
fixen -e "sentence"                 # also explain what was fixed
fixen -e -l Korean "sentence"       # explanations in Korean
fixen -t Japanese "日本語の文"        # correct any language, not just English
fixen -t Auto "안되는거 같아"         # auto-detect English or Korean
fixen --polish "draft message"      # fix a message for humans: show the diff, copy to clipboard
fixen --notify -e "sentence"        # correct in a desktop notification
fixen --last                        # show the most recent notification correction
fixen doctor                        # check backend, storage, clipboard, and notifications
fixen --ask "why was this changed?" # ask about that correction
fixen --clear                       # delete the saved correction
fixen -- <words>                    # never read these words as options
```

Sidecar actions use explicit `--` options, so ordinary text such as `fixen ask me tomorrow` or `fixen notify the team` remains a sentence to correct.

English is just the default. `-t/--target` (or `FIXEN_TARGET`, or `"target"` in the config) switches the language being corrected — `fixen -t French -e -l Korean "..."` corrects French and explains the fixes in Korean. Use `-t Auto` to detect English or Korean automatically; saved history records the detected language rather than `Auto`.

### Options

| Option | Meaning |
| ------ | ------- |
| `-b, --backend <name>` | `claude` \| `codex` \| `gjc` \| `gemini` \| `ollama` \| `api` \| `openai` (default: auto-detect, or config / `FIXEN_BACKEND`) |
| `-c, --command <tmpl>` | custom shell command; `{prompt}` expands to the prompt, otherwise the prompt is piped to stdin |
| `-e, --explain` | also explain what was fixed (config: `"explain": true`) |
| `--no-explain` | no explanations, even if the config enables them |
| `-l, --lang <lang>` | language for explanations (default: English; e.g. Korean) |
| `-t, --target <lang>` | language being corrected (default: English; `Auto` = English or Korean) |
| `-m, --model <model>` | model for the claude/codex/gemini/ollama/api/openai backends |
| `-r, --reasoning <e>` | (openai) reasoning effort: `none\|minimal\|low\|medium\|high` |
| `-f, --file <path>` | (install) extra instruction file to add the line to |
| `--notify` | sidecar-correct the supplied text and notify |
| `--json` | (notify) print the correction as one JSON object |
| `--polish` | correct, show what changed, and copy to the clipboard |
| `--gui` | serve the history dashboard on 127.0.0.1 and open it |
| `--port <n>` | (gui) port to bind (default 5177; 0 = random free port) |
| `--hook` | queue a sidecar job from prompt-submit hook JSON |
| `--last` | show the latest unexpired sidecar correction |
| `--copy` | copy the latest corrected sentence to the clipboard |
| `--ask` | ask about the latest sidecar correction |
| `--clear` | delete the latest sidecar correction |
| `--check` | (update) only report versions; exit 1 if outdated |
| `-h, --help` | show help |
| `-v, --version` | show version |

**Platform:** macOS and Linux are fully supported. On Windows, the `ollama` and `api` backends work natively, but the AI-CLI backends and `-c/--command` need a POSIX shell — run fixen under WSL.

</details>

<details>
<summary><b>Updating</b></summary>

### Updating

```sh
fixen update            # upgrade the package, then rewrite the rule with the new version
fixen update --check    # just compare versions (exit 1 if outdated) — safe for scripts
```

`npm install -g fixen-cli@latest` only replaces the binary: `RULE.md` and the one-liners in your CLIs keep the wording of whatever version wrote them. `fixen update` does both halves — it detects your package manager from the install path (npm, pnpm, yarn, bun; override with `FIXEN_UPDATE_CMD`), upgrades, then re-runs `install` with the *new* binary so the rule matches the new code. A `git`/`npm link` checkout is never overwritten: it reports where the copy lives and refreshes only the rule.

</details>

<details>
<summary><b>Chat mode: corrections inside your AI CLI</b></summary>

### Chat mode: corrections inside your AI CLI

`fixen install` writes the full rule **once** to `~/.config/fixen/RULE.md`, detects which AI CLIs are installed, and adds exactly **one marked line** to each one's global instructions — a compact version of the rule plus a pointer to the rule file. From then on, your normal chats end like this:

```console
$ fixen install
rule  ~/.config/fixen/RULE.md
ok    claude: ~/.claude/CLAUDE.md  (one line added)
ok    codex:  ~/.codex/AGENTS.md   (one line added)
ok    gjc:    ~/.gjc/agent/AGENTS.md (one line added)

$ gjc -p "hey what is capital of france? my dream is go to paris someday"
The capital of France is Paris. ...

> **fixen** · My dream is **to** go to Paris someday.
> ↳ '가다'는 to부정사로 — go → to go
```

Ask about Kubernetes, get better English on the side.

Out of the box it knows the global instruction locations of **claude, codex, gjc, gemini, qwen, opencode, windsurf, goose, crush, and cline** — only the ones actually present are touched. Using something else? Point at its instruction file directly (tracked in a manifest, so `uninstall` cleans it too):

```sh
fixen install -f ~/.someai/INSTRUCTIONS.md
```

Details that keep it polite:

- Only fires when *your own* writing has mistakes — correct sentences, pasted code, logs, and quotes are left alone.
- `fixen install -t Japanese` watches Japanese instead; `-e -l Korean` adds one-line reasons in Korean (`fixen install -t English -e -l Korean`).
- Your existing CLAUDE.md/AGENTS.md content is untouched: one marker-wrapped line in, one line out. For Claude Code the line uses the native `@~/.config/fixen/RULE.md` import, so the full rule is inlined automatically.
- `fixen uninstall` removes every trace (pointer lines, the rule file, and the hotkey); `fixen status` shows where it's active. Re-running `install` is idempotent and upgrades old-style installs in place, and [`fixen update`](#updating) does that for you after every version bump.
- `install` regenerates the rule from the flags and config it sees, so a bare `fixen install` after `fixen install -t Japanese -e` falls back to defaults — keep `"target"`, `"lang"`, and `"explain"` in `config.json` instead of retyping flags.
- Applies to new chat sessions.

</details>

<details>
<summary><b>Instant sidecar notifications</b></summary>

### Instant sidecar notifications

The footer is useful context for follow-up questions, but it cannot appear until the main agent finishes. The sidecar runs the same learning loop independently at prompt-submit time, so a slow coding task does not delay the correction:

```text
prompt submitted
├─ AI agent → normal work → footer when the reply finishes
└─ fixen sidecar → correction result
   ├─ Senpi → compact native `fixen` row after the agent settles
   └─ other tools → desktop notification as soon as it is ready
```

Use the commands directly:

```sh
fixen --notify -e -l Korean "why this doesn't works?"
fixen --notify --json "why this doesn't works?"   # structured output for integrations
fixen --last
fixen --copy
fixen --ask "왜 work로 고쳤어?"
fixen --clear
```

`--notify` filters generated context, code, logs, quotes, URLs, and common secret assignments before invoking the backend. Already-natural writing produces no notification. Only the exact original excerpt selected for correction—not the complete chat prompt—is saved to the private `~/.config/fixen/last-correction.json`. The record expires after 24 hours and each result replaces the previous one. `--last` prints it, `--ask` sends that minimal correction plus your question to the configured backend, and `--clear` deletes it immediately. Set `FIXEN_SIDECAR_NO_STORE=1` to avoid saving the new result; an older saved correction is left untouched.

When Senpi is installed, `fixen install` also installs a native input extension. It starts the same sidecar on prompt submission, then adds one compact, theme-aware transcript row after the main agent settles:

```text
fixen Is Fixen okay? · Natural question order
```

The label, corrected sentence, and first reason use separate semantic colors, so the result is recognizable like Senpi's built-in tool rows. Expanding the row shows the original text and any additional reasons. The row is a TUI-only session entry and is never added to model context.

For an AI tool with a prompt-submit hook, configure the hook command as:

```sh
fixen --hook -e -l Korean
```

The tool passes its event JSON on stdin. `fixen --hook` accepts a documented prompt field or Kiro's `USER_PROMPT`, rejects malformed or over-64-KiB events without blocking the chat, queues a private filtered job, and exits immediately. The detached worker has an 8-second default timeout and no retry, so it never extends the main agent run; values outside 1–600 seconds fall back to 8 seconds. On Kiro, create a **UserPromptSubmit → command** Agent Hook with that command.

Keep the footer rule as a separate agent hook for hybrid mode. That preserves the correction inside the conversation for natural follow-up questions while the notification arrives independently. Existing CLI integrations can still use `fixen install`; for Kiro steering, the generated rule can be targeted explicitly:

```sh
fixen install -e -l Korean -f .kiro/steering/fixen.md
```

Desktop notifications lead with the actual fix — `its → it's` — then the corrected sentence, then the reason. `FIXEN_NOTIFY_DISABLE=1` saves without displaying, `FIXEN_CORRECTION_TTL` changes the record lifetime (maximum seven days), and `FIXEN_SIDECAR_TIMEOUT` changes the worker deadline.

Delivery uses `terminal-notifier` when it is on `PATH` (`brew install terminal-notifier`), falling back to built-in macOS notifications, or `notify-send` on Linux. terminal-notifier is optional but earns the install: banners are grouped so a new correction replaces the previous card instead of stacking, **clicking one copies the corrected sentence to your clipboard**, `FIXEN_NOTIFY_ICON` swaps in your own image, and `FIXEN_NOTIFY_IGNORE_DND=1` shows banners through Do Not Disturb. `fixen --copy` does the same copy from the terminal.

> **macOS banners are silent-fail.** Banners are attributed to whatever posts them — **terminal-notifier**, or **Script Editor** on the `osascript` fallback — never to fixen itself. If that app is off in **System Settings → Notifications**, or a Focus mode is active, macOS drops the banner and still reports success; fixen cannot detect this. `FIXEN_NOTIFY_IGNORE_DND=1` covers the Focus case; either way the correction is saved, so `fixen --last` shows what a missing banner would have said.

</details>

<details>
<summary><b>History dashboard (GUI)</b></summary>

### History dashboard (GUI)

Corrections from one-shot, stdin, interactive, polish, and stored sidecar runs are appended to a private history file (`~/.config/fixen/history.jsonl`, `0600`). Records are capped at 64 KiB each, and history keeps at most the newest 500 entries or 8 MiB. Concurrent fixen processes serialize updates so they cannot overwrite one another. Set `FIXEN_NO_HISTORY=1` to disable history outside the sidecar, or `FIXEN_SIDECAR_NO_STORE=1` to keep sidecar results out. `fixen --gui` turns that file into a local learning dashboard:

```sh
fixen --gui              # serve on 127.0.0.1:5177 and open the browser
fixen --gui --port 0     # pick a random free port
FIXEN_GUI_NO_OPEN=1 fixen --gui   # start without opening a browser
```

The page is a single zero-dependency HTML file served only on `127.0.0.1`. Each launch generates an unguessable URL token, and every API request must present it, preventing unrelated web pages from reading or mutating history. It includes a manual English/Korean correction box (submit with `Cmd/Ctrl+Enter`), backend/model/reasoning selectors, and a timeline with word-level diff highlighting, the reasons for each fix, one-click copy of the corrected sentence, per-correction follow-up questions (routed through your configured backend, like `--ask`), and delete/clear controls.

The backend selector detects and reuses authenticated GJC, Claude Code, Codex, Gemini, and Ollama installations. OpenAI-compatible providers can be configured with a base URL, model ID, and API key; presets are included for DeepSeek, Groq, OpenRouter, and OpenAI. API keys are kept out of `config.json` and stored locally in `~/.config/fixen/credentials.json` with `0600` permissions.

</details>

<details>
<summary><b>Global hotkey (macOS)</b></summary>

### Global hotkey (macOS)

```sh
fixen hotkey
```

This installs a **"Fix with fixen" quick action** (`~/Library/Services`) and binds **⌃⌥⌘F**: select text in any app — Slack, Mail, a browser textarea — press the shortcut, and the corrected text **replaces the selection in place**. The replacement is done by macOS Services itself (the same plumbing as the built-in Transformations menu), so fixen needs no accessibility permissions and never simulates keystrokes. The service runs your configured backend with a 45s ceiling; corrections also work from the right-click → Services menu.

- Change the shortcut: System Settings → Keyboard → Keyboard Shortcuts → Services → Text → Fix with fixen.
- `FIXEN_HOTKEY_NO_REGISTER=1 fixen hotkey` installs the service without touching your shortcut settings.
- `fixen uninstall` removes the quick action along with everything else.
- macOS asks once per app before a service may replace text — that first prompt is expected.
- If **Fix with fixen** shows no shortcut in the Services menu (seen on macOS 26), assign ⌃⌥⌘F once in the Keyboard Shortcuts pane above.

</details>

<details>
<summary><b>Backends: custom command, API, OpenAI reasoning models</b></summary>

### Backends

Auto-detected in this order: `claude` → `codex` → `gjc` → `gemini` → `ollama` → `api` (if an API key is set). Pick one explicitly with `-b`:

| Backend  | Uses                                        |
| -------- | ------------------------------------------- |
| `claude` | `claude -p` (Claude Code)                   |
| `codex`  | `codex exec` (OpenAI Codex CLI)             |
| `gjc`    | `gjc -p --no-tools` with selectable GJC models |
| `gemini` | `gemini -p` (Gemini CLI)                    |
| `ollama` | `ollama run <model>` — local, offline (`fixen -b ollama -m llama3.1 "he dont know nothing"`) |
| `api`    | any OpenAI-compatible `/chat/completions`   |
| `openai` | OpenAI `/responses` — reasoning models       |

#### Custom command

Anything that reads a prompt and prints an answer works:

```sh
fixen -c 'my-llm --quiet {prompt}' "its a beautiful day"   # {prompt} → the prompt, safely quoted
fixen -c 'my-llm --stdin'          "its a beautiful day"   # no {prompt} → prompt piped to stdin
```

#### API backend

```sh
export FIXEN_API_KEY=sk-...
export FIXEN_API_URL=https://api.openai.com/v1   # or any OpenAI-compatible server
export FIXEN_MODEL=gpt-4o-mini
fixen -b api "sentence"
```

#### OpenAI reasoning models (gpt-5.6-pro)

The `pro` tiers are served only by OpenAI's `/responses` endpoint and reject the sampling parameters `/chat/completions` takes, so they get their own backend:

```sh
export FIXEN_API_KEY=sk-...
fixen -b openai -m gpt-5.6-pro "its a beautiful day"
fixen -b openai -m gpt-5.6-pro -r high --polish "sorry for late reply"
```

`-m` is required — a pro tier costs far more than a mini one, so fixen never picks it for you. `-r/--reasoning` (`none|minimal|low|medium|high`) is optional and left to the model's own default when unset. Requests are sent with `store: false`, so your prose is not retained in the OpenAI dashboard.

Reasoning models think before answering, so this backend waits 600 seconds by default (`FIXEN_API_TIMEOUT` overrides it). That is fine for one-shot, `--polish`, the hotkey, and the dashboard. The chat sidecar (`--hook` / `--notify`) still cuts workers off after `FIXEN_SIDECAR_TIMEOUT` seconds — 8 by default, up to 600 — so raise it before pointing the sidecar at a pro model.

</details>

<details>
<summary><b>Configuration and environment variables</b></summary>

### Configuration

Defaults live in `~/.config/fixen/config.json`:

```json
{ "backend": "claude", "model": null, "reasoning": null, "command": null, "lang": "Korean", "target": "English", "explain": true }
```

Environment variables override the config; CLI flags override everything (`--no-explain` turns off a config-enabled `explain` for one run). A failed backend attempt is retried once; tune with `FIXEN_RETRIES` (0 disables retries). Detached notification workers set both backend and API deadlines from a validated `FIXEN_SIDECAR_TIMEOUT` (8 seconds by default, 600 maximum), and terminate the full POSIX process group when that deadline expires.

| Variable | Meaning |
| -------- | ------- |
| `FIXEN_BACKEND` | default backend name |
| `FIXEN_BACKEND_CMD` | default custom command template |
| `FIXEN_TARGET` | default language being corrected |
| `FIXEN_LANG` | default language for explanations |
| `FIXEN_EXPLAIN` | `1`/`true` to explain by default |
| `FIXEN_MODEL` | default model (codex/ollama/api/openai) |
| `FIXEN_REASONING` | default reasoning effort for the `openai` backend |
| `FIXEN_API_URL` | OpenAI-compatible base URL (default: `api.openai.com/v1`) |
| `FIXEN_API_KEY` | API key for the `api` and `openai` backends |
| `FIXEN_API_TIMEOUT` | seconds before an HTTP backend gives up (default 120; openai 600; 0 = never) |
| `FIXEN_BACKEND_TIMEOUT` | seconds before a CLI/custom backend gives up (default 0 = never) |
| `FIXEN_RETRIES` | retries per backend failure (default 1; 0 = never) |
| `FIXEN_SIDECAR_TIMEOUT` | detached worker timeout, 1–600 seconds (default 8) |
| `FIXEN_CORRECTION_TTL` | saved correction lifetime in seconds (default 86400; max 604800) |
| `FIXEN_SIDECAR_NO_STORE` | `1`/`true` to notify without retaining a correction |
| `FIXEN_NO_HISTORY` | `1`/`true` to keep one-shot, stdin, interactive, and polish runs out of history |
| `FIXEN_NOTIFY_DISABLE` | `1`/`true` to save sidecar results without desktop alerts |
| `FIXEN_NOTIFY_ICON` | image path shown instead of the notifier's own icon |
| `FIXEN_NOTIFY_IGNORE_DND` | `1`/`true` to show banners even in Do Not Disturb |
| `FIXEN_GUI_NO_OPEN` | `1`/`true` to start `--gui` without opening the browser |
| `FIXEN_HOTKEY_NO_REGISTER` | `1`/`true` to skip binding the default ⌃⌥⌘F shortcut |
| `FIXEN_REGISTRY` | npm registry for `update` (default: registry.npmjs.org) |
| `FIXEN_UPDATE_CMD` | custom upgrade command; must contain `{spec}` → `fixen-cli@<checked-version>` |
| `FIXEN_DEBUG` | `1` to print stack traces on unexpected errors |

</details>

## License

[MIT](LICENSE)
