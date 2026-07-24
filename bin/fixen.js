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

function buildPrompt(sentence, { explain, lang }) {
  if (!explain) {
    return (
      "You are an English writing corrector. Correct the grammar, spelling, " +
      "word choice, and naturalness of the following English text. " +
      "Reply with ONLY the corrected text — no quotes, no explanation, no preamble. " +
      "If the text is already correct and natural, reply with it unchanged.\n\n" +
      `Text:\n${sentence}`
    );
  }
  return (
    "You are an English writing corrector. Correct the grammar, spelling, " +
    "word choice, and naturalness of the following English text.\n" +
    "Reply in EXACTLY this format and nothing else:\n\n" +
    "Corrected: <the corrected text>\n" +
    "Notes:\n" +
    `- <each fix, briefly explained in ${lang}>\n\n` +
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

// ---------------------------------------------------------------- CLI

const HELP = `fixen ${VERSION} — corrects your English using any LLM backend

Usage:
  fixen [options] <sentence...>       correct a sentence
  echo "sentence" | fixen [options]   correct stdin
  fixen [options]                     interactive mode (TTY)

Options:
  -b, --backend <name>   claude | codex | gjc | gemini | ollama | api
                         (default: auto-detect, or config/FIXEN_BACKEND)
  -c, --command <tmpl>   custom shell command; {prompt} expands to the prompt,
                         otherwise the prompt is piped to stdin
  -e, --explain          also explain what was fixed
  -l, --lang <lang>      language for explanations (default: English; e.g. Korean)
  -m, --model <model>    model for ollama/api backends
  -h, --help             show this help
  -v, --version          show version

Environment:
  FIXEN_BACKEND             default backend name
  FIXEN_BACKEND_CMD         default custom command template
  FIXEN_MODEL               default model (ollama/api)
  FIXEN_API_URL             OpenAI-compatible base URL (default: api.openai.com/v1)
  FIXEN_API_KEY             API key for the 'api' backend

Config (~/.config/fixen/config.json):
  { "backend": "claude", "command": null, "model": null, "lang": "Korean" }

Examples:
  fixen "I has a apple"
  fixen -e -l Korean "She go to school yesterday"
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
    ` — type English, get corrections. Ctrl+D to quit.\n`
  );
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: "en> ",
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
