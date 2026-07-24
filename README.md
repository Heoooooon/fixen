# englishcorrect (`ec`)

Type English, get the corrected sentence back — using **any** LLM backend you already have.

`ec` is a tiny zero-dependency CLI that builds a correction prompt and pipes it into whatever is installed on your machine: `claude`, `codex`, `gjc`, `gemini`, `ollama`, any OpenAI-compatible API, or any custom shell command. No vendor lock-in.

```console
$ ec "I has a apple and she go to school yesterday"
I have an apple, and she went to school yesterday.

$ ec -e -l Korean "he dont know nothing about it"
Corrected: He doesn't know anything about it.
Notes:
- "dont" → "doesn't": 3인칭 단수 주어에는 does not을 사용합니다.
- "know nothing" → "know anything": 이중 부정을 피했습니다.
```

## Install

```sh
npm install -g englishcorrect
# or run from a clone:
git clone https://github.com/you/englishcorrect && cd englishcorrect
npm link
```

Requires Node.js ≥ 18 and at least one backend (see below).

## Usage

```sh
ec "your english sentence"        # one-shot
echo "your sentence" | ec         # stdin / pipes
ec                                # interactive mode (type lines, Ctrl+D to quit)
ec -e "sentence"                  # also explain what was fixed
ec -e -l Korean "sentence"        # explanations in Korean
```

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
ec -c 'my-llm --quiet {prompt}' "its a beautiful day"   # {prompt} → the prompt, safely quoted
ec -c 'my-llm --stdin'          "its a beautiful day"   # no {prompt} → prompt piped to stdin
```

### API backend

```sh
export EC_API_KEY=sk-...
export EC_API_URL=https://api.openai.com/v1   # or any OpenAI-compatible server
export EC_MODEL=gpt-4o-mini
ec -b api "sentence"
```

## Configuration

Defaults can live in `~/.config/englishcorrect/config.json`:

```json
{ "backend": "claude", "model": null, "command": null, "lang": "Korean" }
```

Environment variables `EC_BACKEND`, `EC_BACKEND_CMD`, `EC_MODEL`, `EC_API_URL`, `EC_API_KEY` override the config; CLI flags override everything.

## License

MIT
