#!/usr/bin/env node
"use strict";

/*
 * fixen — Fix your English
 * Backend-agnostic English sentence corrector.
 * Pipes a correction prompt into any LLM backend (claude, codex, gjc,
 * ollama, an OpenAI-compatible API, or any custom shell command) and
 * prints the corrected sentence.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const VERSION = require("../package.json").version;

const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "fixen",
  "config.json"
);

// ---------------------------------------------------------------- helpers

function fail(msg) {
  process.stderr.write(`fixen: ${msg}\n`);
  process.exit(1);
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return r.status === 0;
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function cleanOutput(text) {
  let out = text.trim();
  // strip code fences
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  // strip a single pair of wrapping quotes
  if (/^".*"$/s.test(out)) out = out.slice(1, -1);
  return out.trim();
}

// ---------------------------------------------------------------- prompt

function buildPrompt(sentence, { explain, lang, target }) {
  if (!explain) {
    return (
      `You are a ${target} writing corrector. Correct the grammar, spelling, ` +
      `word choice, and naturalness of the following ${target} text. ` +
      "Reply with ONLY the corrected text — no quotes, no explanation, no preamble. " +
      "If the text is already correct and natural, reply with it unchanged.\n\n" +
      `Text:\n${sentence}`
    );
  }
  return (
    `You are a ${target} writing corrector. Correct the grammar, spelling, ` +
    `word choice, and naturalness of the following ${target} text.\n` +
    "Reply in EXACTLY this format and nothing else:\n\n" +
    "Corrected: <the corrected text>\n" +
    "Notes:\n" +
    `- <each fix, briefly explained>\n\n` +
    `The Notes MUST be written in ${lang}, regardless of the language of the text.\n` +
    `If the text is already correct, say so in the Notes.\n\nText:\n${sentence}`
  );
}

// ---------------------------------------------------------------- backends

function runArgv(argv, { stdin } = {}) {
  const r = spawnSync(argv[0], argv.slice(1), {
    input: stdin,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) fail(`failed to run '${argv[0]}': ${r.error.message}`);
  if (r.status !== 0) {
    const detail = [r.stdout, r.stderr].map((s) => (s || "").trim()).filter(Boolean).join("\n");
    fail(`backend '${argv[0]}' exited with code ${r.status}\n${detail}`);
  }
  return r.stdout;
}

const BACKENDS = {
  claude(prompt) {
    return runArgv(["claude", "-p", prompt]);
  },

  gjc(prompt) {
    return runArgv(["gjc", "-p", prompt]);
  },

  codex(prompt) {
    const tmp = path.join(
      os.tmpdir(),
      `fixen-codex-${process.pid}-${Date.now()}.txt`
    );
    try {
      runArgv(
        ["codex", "exec", "--skip-git-repo-check", "--color", "never", "-o", tmp, "-"],
        { stdin: prompt }
      );
      return fs.readFileSync(tmp, "utf8");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  },

  ollama(prompt, { model }) {
    return runArgv(["ollama", "run", model || "llama3.1"], { stdin: prompt });
  },

  gemini(prompt) {
    return runArgv(["gemini", "-p", prompt]);
  },
};

async function apiBackend(prompt, { model }) {
  const base = (process.env.FIXEN_API_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.FIXEN_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) fail("api backend needs FIXEN_API_KEY (or OPENAI_API_KEY)");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || process.env.FIXEN_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  if (!res.ok) fail(`api backend HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") fail("api backend returned no message content");
  return text;
}

function customBackend(template, prompt) {
  // {prompt} in the template expands to a safely quoted env var.
  // Without {prompt}, the prompt is piped to the command's stdin.
  const usesArg = template.includes("{prompt}");
  const cmd = usesArg ? template.replaceAll("{prompt}", '"$FIXEN_PROMPT"') : template;
  const r = spawnSync("/bin/sh", ["-c", cmd], {
    input: usesArg ? undefined : prompt,
    env: { ...process.env, FIXEN_PROMPT: prompt },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) {
    fail(`custom backend exited with code ${r.status}\n${(r.stderr || "").trim()}`);
  }
  return r.stdout;
}

function detectBackend() {
  for (const name of ["claude", "codex", "gjc", "gemini", "ollama"]) {
    if (which(name)) return name;
  }
  if (process.env.FIXEN_API_KEY || process.env.OPENAI_API_KEY) return "api";
  return null;
}

async function correct(sentence, opts) {
  const prompt = buildPrompt(sentence, opts);
  let raw;
  if (opts.command) {
    raw = customBackend(opts.command, prompt);
  } else if (opts.backend === "api") {
    raw = await apiBackend(prompt, opts);
  } else if (BACKENDS[opts.backend]) {
    raw = BACKENDS[opts.backend](prompt, opts);
  } else {
    fail(`unknown backend '${opts.backend}' (try: ${Object.keys(BACKENDS).join(", ")}, api)`);
  }
  return cleanOutput(raw);
}

// ---------------------------------------------------------------- install
// Plants a correction rule into the global instruction files of installed
// AI CLIs so that every chat reply ends with a correction of what the user
// wrote. Reversible via `fixen uninstall`.

const START_MARK = "<!-- fixen:start — managed by `fixen install`; run `fixen uninstall` to remove -->";
const END_MARK = "<!-- fixen:end -->";
const BLOCK_RE = /\n*<!-- fixen:start[\s\S]*?<!-- fixen:end -->\n*/g;

const INSTALL_TARGETS = [
  { name: "claude", base: path.join(os.homedir(), ".claude"), file: path.join(os.homedir(), ".claude", "CLAUDE.md") },
  { name: "codex", base: path.join(os.homedir(), ".codex"), file: path.join(os.homedir(), ".codex", "AGENTS.md") },
  // ~/.gjc/agent/AGENTS.md is gjc's user-level context file, injected into every session.
  { name: "gjc", base: path.join(os.homedir(), ".gjc", "agent"), file: path.join(os.homedir(), ".gjc", "agent", "AGENTS.md") },
];

function ruleText({ target, lang, explain }) {
  const t = target;
  return `## ${t} check (fixen)

The user is practicing ${t}. In EVERY reply, after answering normally, review the ${t} that the user themselves wrote in their latest message. Ignore quoted text, code, logs, file contents, and anything pasted rather than written by the user.

If their ${t} contains grammar, spelling, or naturalness mistakes, end the reply with this footer:

---
fixen: <corrected version of what the user wrote>${explain ? `\nfixen note: <one short reason per fix, written in ${lang}>` : ""}

Rules:
- One corrected line per mistaken sentence; skip sentences that are already fine.
- If the user's ${t} is fully correct and natural, or the message contains no user-written ${t}, append nothing — no footer at all.
- The footer never replaces or shortens the actual answer.`;
}

function cmdInstall(opts) {
  const block = `${START_MARK}\n${ruleText(opts)}\n${END_MARK}`;
  for (const t of INSTALL_TARGETS) {
    if (!fs.existsSync(t.base)) {
      process.stdout.write(`skip  ${t.name}: ${t.base} not found (CLI not installed?)\n`);
      continue;
    }
    fs.mkdirSync(path.dirname(t.file), { recursive: true });
    const prev = fs.existsSync(t.file) ? fs.readFileSync(t.file, "utf8") : "";
    const stripped = prev.replace(BLOCK_RE, "\n").trimEnd();
    fs.writeFileSync(t.file, (stripped ? stripped + "\n\n" : "") + block + "\n");
    process.stdout.write(`ok    ${t.name}: ${t.file}\n`);
  }
  process.stdout.write(`\nNew chat sessions of the CLIs above will now end replies with a ${opts.target} correction.\n`);
}

function cmdUninstall() {
  for (const t of INSTALL_TARGETS) {
    if (!fs.existsSync(t.file)) {
      process.stdout.write(`-     ${t.name}: not installed\n`);
      continue;
    }
    const prev = fs.readFileSync(t.file, "utf8");
    if (!prev.includes(START_MARK)) {
      process.stdout.write(`-     ${t.name}: not installed\n`);
      continue;
    }
    const stripped = prev.replace(BLOCK_RE, "\n").trim();
    if (stripped) fs.writeFileSync(t.file, stripped + "\n");
    else fs.rmSync(t.file);
    process.stdout.write(`ok    ${t.name}: removed\n`);
  }
}

function cmdStatus() {
  for (const t of INSTALL_TARGETS) {
    const installed = fs.existsSync(t.file) &&
      fs.readFileSync(t.file, "utf8").includes(START_MARK);
    process.stdout.write(`${installed ? "on " : "off"}  ${t.name}: ${t.file}\n`);
  }
}

// ---------------------------------------------------------------- CLI

const HELP = `fixen ${VERSION} — corrects your writing (any language) using any LLM backend

Usage:
  fixen [options] <sentence...>       correct a sentence
  echo "sentence" | fixen [options]   correct stdin
  fixen [options]                     interactive mode (TTY)

  fixen install [-t <lang>] [-e] [-l <lang>]
      plant a rule into claude/codex/gjc global instructions so every normal
      chat reply ends with a correction of what you typed
  fixen uninstall                     remove that rule everywhere
  fixen status                        show where the rule is installed

Options:
  -b, --backend <name>   claude | codex | gjc | gemini | ollama | api
                         (default: auto-detect, or config/FIXEN_BACKEND)
  -c, --command <tmpl>   custom shell command; {prompt} expands to the prompt,
                         otherwise the prompt is piped to stdin
  -e, --explain          also explain what was fixed
  -l, --lang <lang>      language for explanations (default: English; e.g. Korean)
  -t, --target <lang>    language being corrected (default: English)
  -m, --model <model>    model for ollama/api backends
  -h, --help             show this help
  -v, --version          show version

Environment:
  FIXEN_BACKEND             default backend name
  FIXEN_BACKEND_CMD         default custom command template
  FIXEN_TARGET              default language being corrected
  FIXEN_MODEL               default model (ollama/api)
  FIXEN_API_URL             OpenAI-compatible base URL (default: api.openai.com/v1)
  FIXEN_API_KEY             API key for the 'api' backend

Config (~/.config/fixen/config.json):
  { "backend": "claude", "command": null, "model": null, "lang": "Korean", "target": "English" }

Examples:
  fixen "I has a apple"
  fixen -e -l Korean "She go to school yesterday"
  fixen -t Japanese "私は昨日学校に行きたです"
  fixen -b ollama -m llama3.1 "he dont know nothing"
  fixen -c 'my-llm --quiet {prompt}' "its a beautiful day"`;

function parseArgs(argv) {
  const opts = { words: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h": case "--help": process.stdout.write(HELP + "\n"); process.exit(0);
      case "-v": case "--version": process.stdout.write(VERSION + "\n"); process.exit(0);
      case "-e": case "--explain": opts.explain = true; break;
      case "-b": case "--backend": opts.backend = argv[++i]; break;
      case "-c": case "--command": opts.command = argv[++i]; break;
      case "-l": case "--lang": opts.lang = argv[++i]; break;
      case "-t": case "--target": opts.target = argv[++i]; break;
      case "-m": case "--model": opts.model = argv[++i]; break;
      case "--": opts.words.push(...argv.slice(i + 1)); i = argv.length; break;
      default:
        if (a.startsWith("-") && a !== "-") fail(`unknown option '${a}' (see fixen --help)`);
        opts.words.push(a);
    }
  }
  return opts;
}

async function interactive(opts) {
  process.stderr.write(
    `fixen ${VERSION} — backend: ${opts.command ? "custom" : opts.backend}` +
    ` — type ${opts.target}, get corrections. Ctrl+D to quit.\n`
  );
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: "fix> ",
  });
  rl.prompt();
  for await (const line of rl) {
    const s = line.trim();
    if (s === ":q" || s === ":quit") break;
    if (s) {
      try {
        process.stdout.write((await correct(s, opts)) + "\n");
      } catch (e) {
        process.stderr.write(`fixen: ${e.message}\n`);
      }
    }
    rl.prompt();
  }
  rl.close();
}

async function main() {
  const cfg = loadConfig();
  const opts = parseArgs(process.argv.slice(2));
  opts.command ??= process.env.FIXEN_BACKEND_CMD || cfg.command || undefined;
  opts.backend ??= process.env.FIXEN_BACKEND || cfg.backend || undefined;
  opts.model ??= process.env.FIXEN_MODEL || cfg.model || undefined;
  opts.lang ??= cfg.lang || "English";
  opts.target ??= process.env.FIXEN_TARGET || cfg.target || "English";

  const sub = opts.words[0];
  if (sub === "install") { cmdInstall(opts); return; }
  if (sub === "uninstall") { cmdUninstall(); return; }
  if (sub === "status") { cmdStatus(); return; }

  if (!opts.command && !opts.backend) {
    opts.backend = detectBackend();
    if (!opts.backend) {
      fail(
        "no backend found. Install one of: claude, codex, gjc, gemini, ollama —\n" +
        "or set FIXEN_API_KEY, or configure a custom command (see fixen --help)."
      );
    }
  }

  if (opts.words.length > 0) {
    process.stdout.write((await correct(opts.words.join(" "), opts)) + "\n");
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) fail("empty input");
    process.stdout.write((await correct(text, opts)) + "\n");
  } else {
    await interactive(opts);
  }
}

main().catch((e) => fail(e.message));
