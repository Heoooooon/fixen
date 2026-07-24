# fixen

**Fix your English from the command line** — using any LLM backend you already have.

`fixen` is a tiny zero-dependency CLI that builds a correction prompt and pipes it into whatever is installed on your machine: `claude`, `codex`, `gjc`, `gemini`, `ollama`, any OpenAI-compatible API, or any custom shell command. No vendor lock-in.

```console
$ fixen "I has a apple and she go to school yesterday"
I have an apple, and she went to school yesterday.

$ fixen -e -l Korean "he dont know nothing about it"
Corrected: He doesn't know anything about it.
Notes:
- "dont" → "doesn't": 3인칭 단수 주어에는 does not을 사용합니다.
- "know nothing" → "know anything": 이중 부정을 피했습니다.
```

## Install

```sh
npm install -g fixen
# or run from a clone:
git clone https://github.com/you/fixen && cd fixen
npm link
```

Requires Node.js ≥ 18 and at least one backend (see below).

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

Defaults can live in `~/.config/fixen/config.json`:

```json
{ "backend": "claude", "model": null, "command": null, "lang": "Korean", "target": "English" }
```

Environment variables `FIXEN_BACKEND`, `FIXEN_BACKEND_CMD`, `FIXEN_TARGET`, `FIXEN_MODEL`, `FIXEN_API_URL`, `FIXEN_API_KEY` override the config; CLI flags override everything.

## License

MIT
