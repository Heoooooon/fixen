<p align="center">
  <img src="https://raw.githubusercontent.com/Heoooooon/fixen/main/assets/readme/hero.png" alt="fixen — fix your English from the command line with the LLM you already have. A chat transcript shows a question typed with mistakes, a normal answer, and a fixen line that corrects the user's own sentence." width="100%">
</p>

# fixen

[![npm](https://img.shields.io/npm/v/fixen-cli)](https://www.npmjs.com/package/fixen-cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![deps](https://img.shields.io/badge/dependencies-0-orange)

You already talk to an LLM all day. `fixen` turns it into your personal proofreader: one tiny zero-dependency CLI that builds a correction prompt and pipes it into whatever is on your machine — `claude`, `codex`, `gjc`, `gemini`, `ollama`, any OpenAI-compatible API, or any shell command that reads a prompt and prints an answer. No accounts, no API keys (unless you want one), no vendor lock-in.

<p align="center">
  <img src="https://raw.githubusercontent.com/Heoooooon/fixen/main/assets/demo.gif" alt="fixen demo: correcting English with explanations in Korean, and Japanese with -t" width="860">
</p>

And the part that makes it stick: `fixen install` hooks your AI chat CLIs so **every normal chat reply ends with a correction of what you typed**. You learn while you work, for free, without opening a single flashcard app.

## Install

```sh
npm install -g fixen-cli    # installs the `fixen` command
```

Requires Node.js ≥ 18 and at least one [backend](#backends) — if you can run `claude`, `codex`, `gjc`, `gemini`, or `ollama` in a terminal, you're done.

**Platform:** macOS and Linux are fully supported. On Windows, the `ollama` and `api` backends work natively, but the AI-CLI backends and `-c/--command` need a POSIX shell — run fixen under WSL.

### Updating

```sh
fixen update            # upgrade the package, then rewrite the rule with the new version
fixen update --check    # just compare versions (exit 1 if outdated) — safe for scripts
```

`npm install -g fixen-cli@latest` only replaces the binary: `RULE.md` and the one-liners in your CLIs keep the wording of whatever version wrote them. `fixen update` does both halves — it detects your package manager from the install path (npm, pnpm, yarn, bun; override with `FIXEN_UPDATE_CMD`), upgrades, then re-runs `install` with the *new* binary so the rule matches the new code. A `git`/`npm link` checkout is never overwritten: it reports where the copy lives and refreshes only the rule.

## Usage

```sh
fixen "your english sentence"     # one-shot
echo "your sentence" | fixen      # stdin / pipes
fixen                             # interactive mode (type lines, Ctrl+D to quit)
fixen -e "sentence"               # also explain what was fixed
fixen -e -l Korean "sentence"     # explanations in Korean
fixen -t Japanese "日本語の文"      # correct any language, not just English
```

English is just the default. `-t/--target` (or `FIXEN_TARGET`, or `"target"` in the config) switches the language being corrected — `fixen -t French -e -l Korean "..."` corrects French and explains the fixes in Korean.

## Chat mode: corrections inside your AI CLI

The killer feature. `fixen install` writes the full rule **once** to `~/.config/fixen/RULE.md`, detects which AI CLIs are installed, and adds exactly **one marked line** to each one's global instructions — a compact version of the rule plus a pointer to the rule file. From then on, your normal chats end like this:

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

Ask about Kubernetes, get better English on the side. Every message you type is a free micro-lesson.

Out of the box it knows the global instruction files of **claude, codex, gjc, gemini, qwen, opencode, windsurf, goose, and crush** — only the ones actually present are touched. Using something else? Point at its instruction file directly (tracked in a manifest, so `uninstall` cleans it too):

```sh
fixen install -f ~/.someai/INSTRUCTIONS.md
```

Details that keep it polite:

- Only fires when *your own* writing has mistakes — correct sentences, pasted code, logs, and quotes are left alone.
- `fixen install -t Japanese` watches Japanese instead; `-e -l Korean` adds one-line reasons in Korean.
- Your existing CLAUDE.md/AGENTS.md content is untouched: one marker-wrapped line in, one line out. For Claude Code the line uses the native `@~/.config/fixen/RULE.md` import, so the full rule is inlined automatically.
- `fixen uninstall` removes every trace (pointer lines and the rule file); `fixen status` shows where it's active. Re-running `install` is idempotent and upgrades old-style installs in place, and [`fixen update`](#updating) does that for you after every version bump.
- `install` regenerates the rule from the flags and config it sees, so a bare `fixen install` after `fixen install -t Japanese -e` falls back to defaults — keep `"target"`, `"lang"`, and `"explain"` in `config.json` instead of retyping flags.
- Applies to new chat sessions.

## Backends

Auto-detected in this order: `claude` → `codex` → `gjc` → `gemini` → `ollama` → `api` (if an API key is set). Pick one explicitly with `-b`:

| Backend  | Uses                                        |
| -------- | ------------------------------------------- |
| `claude` | `claude -p` (Claude Code)                   |
| `codex`  | `codex exec` (OpenAI Codex CLI)             |
| `gjc`    | `gjc -p` (Gajae Code)                       |
| `gemini` | `gemini -p` (Gemini CLI)                    |
| `ollama` | `ollama run <model>` — local, offline       |
| `api`    | any OpenAI-compatible `/chat/completions`   |

### Custom command

Anything that reads a prompt and prints an answer works:

```sh
fixen -c 'my-llm --quiet {prompt}' "its a beautiful day"   # {prompt} → the prompt, safely quoted
fixen -c 'my-llm --stdin'          "its a beautiful day"   # no {prompt} → prompt piped to stdin
```

### API backend

```sh
export FIXEN_API_KEY=sk-...
export FIXEN_API_URL=https://api.openai.com/v1   # or any OpenAI-compatible server
export FIXEN_MODEL=gpt-4o-mini
fixen -b api "sentence"
```

## Configuration

Defaults live in `~/.config/fixen/config.json`:

```json
{ "backend": "claude", "model": null, "command": null, "lang": "Korean", "target": "English", "explain": true }
```

Environment variables `FIXEN_BACKEND`, `FIXEN_BACKEND_CMD`, `FIXEN_TARGET`, `FIXEN_LANG`, `FIXEN_EXPLAIN`, `FIXEN_MODEL`, `FIXEN_API_URL`, `FIXEN_API_KEY` override the config; CLI flags override everything (`--no-explain` turns off a config-enabled `explain` for one run).

## Why fixen

- **Zero dependencies.** One file, ~29 KB unpacked. `npm install` finishes before you blink.
- **Bring your own model.** Your existing CLI subscription or a local `ollama` model — fixen doesn't care and never sees your text itself.
- **Any language.** English by default; `-t` corrects Japanese, French, German, anything.
- **Reversible.** `fixen uninstall` puts every touched file back exactly as it was.

## License

MIT
