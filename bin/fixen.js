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

const PKG = require("../package.json");
const VERSION = PKG.version;

const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "fixen",
  "config.json"
);

// ---------------------------------------------------------------- colors
// Zero-dependency ANSI palette. Colors are decided per stream: enabled only
// on a TTY, disabled by NO_COLOR / TERM=dumb, forced by FORCE_COLOR — so
// piped output stays clean plain text.

function mkPalette(enabled) {
  const wrap = (open, close) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  };
}

function colorOn(stream) {
  if (process.env.FORCE_COLOR === "0") return false;
  if ("FORCE_COLOR" in process.env) return true; // wins over NO_COLOR, like Node
  if ("NO_COLOR" in process.env || process.env.TERM === "dumb") return false;
  return Boolean(stream.isTTY);
}

const OUT = mkPalette(colorOn(process.stdout));
const ERR = mkPalette(colorOn(process.stderr));

// Transient "backend is thinking" line on stderr; returns a clearer. Only on
// a real TTY — \r line-clearing is meaningless in pipes and log captures.
function statusLine(msg) {
  if (!process.stderr.isTTY || !ERR.enabled) return () => {};
  process.stderr.write(ERR.dim(`◌ ${msg}…`));
  return () => process.stderr.write("\r\x1b[2K");
}

// Renders a correction for human eyes: check mark + bold sentence, dimmed
// bulleted notes. Falls back to plain text when stdout is not a color TTY.
function prettyResult(text, { explain }) {
  if (!OUT.enabled) return text;
  const m = explain && text.match(/^Corrected:\s*([\s\S]*?)\n\s*Notes:\s*\n?([\s\S]*)$/i);
  if (!m) return `${OUT.green("✔")} ${OUT.bold(text)}`;
  const notes = m[2]
    .trim()
    .split("\n")
    .map((l) => `  ${OUT.dim(l.trim().replace(/^-\s*/, "• "))}`)
    .join("\n");
  return `${OUT.green("✔")} ${OUT.bold(m[1].trim())}${notes ? "\n" + notes : ""}`;
}

// ---------------------------------------------------------------- helpers

function fail(msg) {
  if (process.stderr.isTTY) process.stderr.write("\r\x1b[2K"); // drop any pending status line
  process.stderr.write(`${ERR.red("fixen:")} ${msg}\n`);
  process.exit(1);
}

const IS_WIN = process.platform === "win32";

// CLI backends are usually installed as .cmd shims on Windows, which Node
// cannot spawn directly; the 'ollama' and 'api' backends work natively.
const WIN_HINT =
  "\nOn Windows, AI CLIs installed as .cmd shims cannot be launched directly. " +
  "Use WSL, or the 'ollama' / 'api' backend.";

function which(cmd) {
  const r = spawnSync(IS_WIN ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return r.status === 0;
}

function loadConfig() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, "utf8");
  } catch {
    return {}; // no config file — normal
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    process.stderr.write(
      `${ERR.red("fixen:")} ignoring malformed config ${CONFIG_PATH}: ${e.message}\n`
    );
    return {};
  }
}

// Truthiness for values that arrive as JSON booleans (config) or strings
// (env vars). Returns undefined when unset, so the next source can win.
function boolish(v) {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string" || v.trim() === "") return undefined;
  return !/^(0|false|no|off)$/i.test(v.trim());
}

function cleanOutput(text) {
  let out = text.trim();
  // strip code fences
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  // strip a single pair of wrapping quotes — only when nothing inside is
  // quoted, so dialogue like `"Hi," he said, "bye."` is left intact
  if (/^"[^"]*"$/s.test(out)) out = out.slice(1, -1);
  // strip a trailing chat-mode footer: with `fixen install` active, backend
  // CLIs may append their own "> **fixen** · ..." (or the pre-0.1.8 "---\nfixen:"
  // form) to our one-shot correction
  out = out.replace(/\n+(?:-{3,}\s*\n\s*\*{0,2}fixen\*{0,2}\s*:|>?\s*\*{0,2}fixen\*{0,2}\s*·)[\s\S]*$/, "");
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

// Throws (rather than fail()s) so withRetry can catch a transient failure;
// correct() turns the final, out-of-retries failure into fail().
function runArgv(argv, { stdin } = {}) {
  const r = spawnSync(argv[0], argv.slice(1), {
    input: stdin,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) {
    throw new Error(`failed to run '${argv[0]}': ${r.error.message}${IS_WIN ? WIN_HINT : ""}`);
  }
  if (r.status !== 0) {
    const detail = [r.stdout, r.stderr].map((s) => (s || "").trim()).filter(Boolean).join("\n");
    throw new Error(`backend '${argv[0]}' exited with code ${r.status}\n${detail}`);
  }
  return r.stdout;
}

const BACKENDS = {
  // Prompt goes via stdin, not argv: argv caps out at ARG_MAX (~1 MB on
  // macOS), which a piped document can blow past. All three CLIs read stdin.
  claude(prompt, { model }) {
    return runArgv(["claude", "-p", ...(model ? ["--model", model] : [])], { stdin: prompt });
  },

  gjc(prompt) {
    return runArgv(["gjc", "-p"], { stdin: prompt });
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

  gemini(prompt, { model }) {
    return runArgv(["gemini", "-p", ...(model ? ["-m", model] : [])], { stdin: prompt });
  },
};

async function apiBackend(prompt, { model }) {
  const base = (process.env.FIXEN_API_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.FIXEN_API_KEY || process.env.OPENAI_API_KEY;
  // Config errors fail() outright — deterministic, never worth a retry.
  if (!key) fail("api backend needs FIXEN_API_KEY (or OPENAI_API_KEY)");
  // A hung server must not hang fixen forever; FIXEN_API_TIMEOUT overrides
  // (seconds; 0 disables). A correction never needs two minutes.
  const timeoutS = Number(process.env.FIXEN_API_TIMEOUT ?? 120);
  const res = await fetch(`${base}/chat/completions`, {
    signal: timeoutS > 0 ? AbortSignal.timeout(timeoutS * 1000) : undefined,
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
  if (!res.ok) throw new Error(`api backend HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("api backend returned no message content");
  return text;
}

function customBackend(template, prompt) {
  // {prompt} in the template expands to a safely quoted env var.
  // Without {prompt}, the prompt is piped to the command's stdin.
  if (IS_WIN) fail("-c/--command needs a POSIX shell; run fixen under WSL on Windows.");
  const usesArg = template.includes("{prompt}");
  const cmd = usesArg ? template.replaceAll("{prompt}", '"$FIXEN_PROMPT"') : template;
  const r = spawnSync("/bin/sh", ["-c", cmd], {
    input: usesArg ? undefined : prompt,
    env: { ...process.env, FIXEN_PROMPT: prompt },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`custom backend exited with code ${r.status}\n${(r.stderr || "").trim()}`);
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

// ---------------------------------------------------------------- retry
// Backends flake — a CLI shim crashes, an API 500s, wifi blips. Each
// attempt throws into withRetry, which retries up to FIXEN_RETRIES times
// (default 1) with a stderr warning per retry; correct() surfaces the
// final failure.

function retryCount() {
  const raw = process.env.FIXEN_RETRIES;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

async function withRetry(label, fn) {
  const retries = retryCount();
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        const first = String(e.message).split("\n")[0];
        process.stderr.write(
          `${ERR.yellow("retry")} ${label} failed (${first}) — retrying (${attempt + 1}/${retries})…\n`
        );
      }
    }
  }
  throw lastError;
}

async function correct(sentence, opts) {
  const prompt = buildPrompt(sentence, opts);
  let raw;
  if (opts.command) {
    raw = await withRetry("custom", () => customBackend(opts.command, prompt));
  } else if (opts.backend === "api") {
    raw = await withRetry("api", () => apiBackend(prompt, opts));
  } else if (BACKENDS[opts.backend]) {
    raw = await withRetry(opts.backend, () => BACKENDS[opts.backend](prompt, opts));
  } else {
    fail(`unknown backend '${opts.backend}' (try: ${Object.keys(BACKENDS).join(", ")}, api)`);
  }
  return cleanOutput(raw);
}

// ---------------------------------------------------------------- install
// Writes the full rule ONCE to ~/.config/fixen/RULE.md, then adds a single
// marked line to each CLI's global instruction file: a compact version of the
// rule plus a pointer to RULE.md. Claude's @import inlines the full rule.
// Reversible via `fixen uninstall`.

const START_MARK = "<!-- fixen:start -->";
const END_MARK = "<!-- fixen:end -->";
const BLOCK_RE = /\n*<!-- fixen:start[\s\S]*?<!-- fixen:end -->\n*/g;
const RULE_FILE = path.join(path.dirname(CONFIG_PATH), "RULE.md");
const RULE_FILE_TILDE = RULE_FILE.startsWith(os.homedir()) ? "~" + RULE_FILE.slice(os.homedir().length) : RULE_FILE;
// Custom targets added via --file are recorded here so uninstall/status find them.
const MANIFEST_FILE = path.join(path.dirname(CONFIG_PATH), "installed.json");

function target(name, baseParts, fileParts, opts = {}) {
  return {
    name,
    base: path.join(os.homedir(), ...baseParts),
    file: path.join(os.homedir(), ...fileParts),
    // @import is inlined natively by claude/gemini-family CLIs.
    pointer: opts.atImport ? `@${RULE_FILE_TILDE}` : RULE_FILE_TILDE,
  };
}

// Global instruction files of known AI CLIs. Only those whose base dir exists
// (i.e. the CLI is actually installed) are touched.
const INSTALL_TARGETS = [
  target("claude", [".claude"], [".claude", "CLAUDE.md"], { atImport: true }),
  target("codex", [".codex"], [".codex", "AGENTS.md"]),
  target("gjc", [".gjc", "agent"], [".gjc", "agent", "AGENTS.md"]),
  target("gemini", [".gemini"], [".gemini", "GEMINI.md"], { atImport: true }),
  target("qwen", [".qwen"], [".qwen", "QWEN.md"], { atImport: true }),
  target("opencode", [".config", "opencode"], [".config", "opencode", "AGENTS.md"]),
  target("windsurf", [".codeium", "windsurf"], [".codeium", "windsurf", "memories", "global_rules.md"]),
  target("goose", [".config", "goose"], [".config", "goose", ".goosehints"]),
  target("crush", [".config", "crush"], [".config", "crush", "CRUSH.md"]),
  // Cline keeps global rules as .md files in a directory, not one shared
  // instruction file — fixen gets its own file there.
  target("cline", ["Documents", "Cline"], ["Documents", "Cline", "Rules", "fixen.md"]),
];

function customTarget(file) {
  const abs = path.resolve(file.replace(/^~(?=\/|$)/, os.homedir()));
  return { name: "custom", base: path.dirname(abs), file: abs, pointer: RULE_FILE_TILDE };
}

function loadManifest() {
  try {
    const files = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")).files;
    return Array.isArray(files) ? files.filter((f) => typeof f === "string") : [];
  } catch {
    return [];
  }
}

function allTargets() {
  const known = new Set(INSTALL_TARGETS.map((t) => t.file));
  return [
    ...INSTALL_TARGETS,
    ...loadManifest().filter((f) => !known.has(f)).map(customTarget),
  ];
}

// One line carrying the essential behavior, so it works even in CLIs that
// don't auto-read the referenced file.
function pointerLine({ target, lang, explain }, pointer) {
  // `\\n` stays escaped: it must reach the model as the two characters \n
  // inside the quoted footer template, not as a real newline in the file.
  const note = explain ? `\\n> ↳ <one short reason per fix, in ${lang}>` : "";
  return (
    `${START_MARK} fixen: if the ${target} the user wrote themselves in their latest message ` +
    `has mistakes (ignore pasted text/code/quotes), append "\\n> **fixen** · <corrected sentence, ` +
    `with **bold** on the changed words only>${note}" ` +
    `after your normal answer; if it is correct, append nothing. Full rule: ${pointer} ${END_MARK}`
  );
}

function ruleText({ target, lang, explain }) {
  const t = target;
  return `# fixen — ${t} correction rule

Managed by \`fixen install\`; run \`fixen uninstall\` to remove.

## ${t} check

The user is practicing ${t}. In EVERY reply, after answering normally, review the ${t} that the user themselves wrote in their latest message. Ignore quoted text, code, logs, file contents, and anything pasted rather than written by the user.

If their ${t} contains grammar, spelling, or naturalness mistakes, end the reply with this footer:

> **fixen** · <corrected version of what the user wrote>${explain ? `\n> ↳ <one short reason per fix, written in ${lang}>` : ""}

Rules:
- Every footer line starts with \`> \` so it renders as one quoted block, set apart from the answer.
- Inside the corrected sentence, bold **only the words you changed** (\`I **am** going\`, \`됐지**?**\`). Never bold the whole sentence, and never wrap it in backticks — a backtick span stretches CJK text.
- One corrected line per mistaken sentence; skip sentences that are already fine. The \`**fixen** ·\` label appears once; further corrected sentences get their own \`> \` line without it.
- If the user's ${t} is fully correct and natural, or the message contains no user-written ${t}, append nothing — no footer at all.
- The footer never replaces or shortens the actual answer.`;
}

function cmdInstall(opts) {
  fs.mkdirSync(path.dirname(RULE_FILE), { recursive: true });
  fs.writeFileSync(RULE_FILE, ruleText(opts) + "\n");
  process.stdout.write(`${OUT.cyan("rule")}  ${OUT.dim(RULE_FILE)}\n`);
  const customs = (opts.files || []).map(customTarget);
  const knownFiles = new Set(INSTALL_TARGETS.map((t) => t.file));
  const targets = [...allTargets().filter((t) => !customs.some((c) => c.file === t.file)), ...customs];
  const installedFiles = [];
  for (const t of targets) {
    if (t.name !== "custom" && !fs.existsSync(t.base)) {
      process.stdout.write(OUT.dim(`skip  ${t.name}: ${t.base} not found (CLI not installed?)`) + "\n");
      continue;
    }
    fs.mkdirSync(path.dirname(t.file), { recursive: true });
    const prev = fs.existsSync(t.file) ? fs.readFileSync(t.file, "utf8") : "";
    const stripped = prev.replace(BLOCK_RE, "\n").trimEnd();
    fs.writeFileSync(t.file, (stripped ? stripped + "\n\n" : "") + pointerLine(opts, t.pointer) + "\n");
    if (!knownFiles.has(t.file)) installedFiles.push(t.file);
    process.stdout.write(`${OUT.green("ok")}    ${OUT.bold(t.name)}: ${t.file} ${OUT.dim("(one line added)")}\n`);
  }
  if (installedFiles.length > 0) {
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify({ files: installedFiles }, null, 2) + "\n");
  }
  process.stdout.write(`\nNew chat sessions of the CLIs above will now end replies with a ${OUT.bold(opts.target)} correction.\n`);
  process.stdout.write(OUT.dim(`Using a different AI tool? Point at its global instruction file: fixen install -f <path>`) + "\n");
}

function cmdUninstall() {
  for (const t of allTargets()) {
    if (!fs.existsSync(t.file)) {
      if (fs.existsSync(t.base)) process.stdout.write(OUT.dim(`-     ${t.name}: not installed`) + "\n");
      continue;
    }
    const prev = fs.readFileSync(t.file, "utf8");
    if (!prev.includes(START_MARK)) {
      process.stdout.write(OUT.dim(`-     ${t.name}: not installed`) + "\n");
      continue;
    }
    const stripped = prev.replace(BLOCK_RE, "\n").trim();
    // Rewrite, never delete: the file may have existed (even empty) before us.
    fs.writeFileSync(t.file, stripped ? stripped + "\n" : "");
    process.stdout.write(`${OUT.green("ok")}    ${OUT.bold(t.name)}: removed\n`);
  }
  for (const f of [RULE_FILE, MANIFEST_FILE]) {
    if (fs.existsSync(f)) {
      fs.rmSync(f);
      process.stdout.write(`${OUT.green("ok")}    removed: ${OUT.dim(f)}\n`);
    }
  }
}

function onOff(installed) {
  return installed ? OUT.green("on ") : OUT.yellow("off");
}

function cmdStatus() {
  process.stdout.write(`${onOff(fs.existsSync(RULE_FILE))}  ${OUT.bold("rule")}: ${OUT.dim(RULE_FILE)}\n`);
  for (const t of allTargets()) {
    const installed = fs.existsSync(t.file) &&
      fs.readFileSync(t.file, "utf8").includes(START_MARK);
    if (!installed && t.name !== "custom" && !fs.existsSync(t.base)) continue; // CLI not installed — noise
    process.stdout.write(`${onOff(installed)}  ${OUT.bold(t.name)}: ${OUT.dim(t.file)}\n`);
  }
}

// ---------------------------------------------------------------- update
// `npm i -g` alone only swaps bin/fixen.js: RULE.md and the pointer lines keep
// the wording of whatever version installed them. `fixen update` does both —
// bump the package, then re-generate the rule with the newly installed code.

const REGISTRY = (process.env.FIXEN_REGISTRY || "https://registry.npmjs.org").replace(/\/$/, "");
const PKG_ROOT = path.resolve(__dirname, "..");

// Semver-lite: numeric triple wins, then prerelease (any prerelease < release).
// Enough for our own tags; we never compare arbitrary ranges.
function cmpVersions(a, b) {
  const parse = (v) => {
    const s = String(v).trim().replace(/^v/, "").split("+")[0];
    const i = s.indexOf("-");
    return {
      nums: (i === -1 ? s : s.slice(0, i)).split(".").map((n) => parseInt(n, 10) || 0),
      pre: i === -1 ? "" : s.slice(i + 1),
    };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  // Dot-wise semver ordering: numeric segments compare as numbers (rc.10 >
  // rc.2), a numeric segment sorts before an alphanumeric one, otherwise
  // lexicographic.
  const xs = x.pre.split(".");
  const ys = y.pre.split(".");
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const a = xs[i];
    const b = ys[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const an = /^\d+$/.test(a);
    const bn = /^\d+$/.test(b);
    if (an && bn) {
      const d = parseInt(a, 10) - parseInt(b, 10);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (an !== bn) {
      return an ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

async function latestVersion() {
  let res;
  try {
    res = await fetch(`${REGISTRY}/${PKG.name}/latest`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    fail(`cannot reach ${REGISTRY}: ${e.message}`);
  }
  if (!res.ok) fail(`registry HTTP ${res.status} for ${PKG.name}`);
  const version = (await res.json()).version;
  if (typeof version !== "string") fail("registry returned no version");
  return version;
}

// A global install lives in <prefix>/lib/node_modules/<pkg>; a `npm link`ed or
// git checkout does not. Never run a global install over someone's working copy.
function installKind() {
  if (fs.existsSync(path.join(PKG_ROOT, ".git"))) return "git";
  if (path.basename(path.dirname(PKG_ROOT)) !== "node_modules") return "linked";
  return "global";
}

// Best-effort guess from the install path, so pnpm/bun users don't get npm.
function detectManager() {
  const p = PKG_ROOT.split(path.sep).join("/");
  if (/\/\.bun\//.test(p)) return "bun";
  if (/\/pnpm\//i.test(p)) return "pnpm";
  if (/\/[Yy]arn\//.test(p)) return "yarn";
  return "npm";
}

const UPGRADE_ARGV = {
  npm: (spec) => ["npm", "install", "-g", spec],
  pnpm: (spec) => ["pnpm", "add", "-g", spec],
  yarn: (spec) => ["yarn", "global", "add", spec],
  bun: (spec) => ["bun", "add", "-g", spec],
};

function runUpgrade(spec) {
  const custom = process.env.FIXEN_UPDATE_CMD;
  if (custom) {
    if (IS_WIN) fail("FIXEN_UPDATE_CMD needs a POSIX shell; run fixen under WSL on Windows.");
    if (!custom.includes("{spec}")) fail("FIXEN_UPDATE_CMD must contain {spec} — it expands to fixen-cli@latest");
    const cmd = custom.replaceAll("{spec}", spec);
    process.stdout.write(OUT.dim(`run   ${cmd}`) + "\n");
    return spawnSync("/bin/sh", ["-c", cmd], { stdio: "inherit" });
  }
  const argv = UPGRADE_ARGV[detectManager()](spec);
  process.stdout.write(OUT.dim(`run   ${argv.join(" ")}`) + "\n");
  return spawnSync(argv[0], argv.slice(1), { stdio: "inherit", shell: IS_WIN });
}

function chatInstalled() {
  return allTargets().some(
    (t) => fs.existsSync(t.file) && fs.readFileSync(t.file, "utf8").includes(START_MARK)
  );
}

// After an upgrade this process is still the old code, so the rule has to be
// written by the binary that was just installed — hence the re-exec.
function refreshRule(opts, reexec) {
  if (!chatInstalled()) {
    process.stdout.write(OUT.dim("skip  chat mode not installed (run: fixen install)") + "\n");
    return;
  }
  if (!reexec) {
    cmdInstall({ ...opts, files: [] });
    return;
  }
  const argv = ["install", "-t", opts.target, "-l", opts.lang, ...(opts.explain ? ["-e"] : [])];
  const r = spawnSync(process.execPath, [process.argv[1], ...argv], { stdio: "inherit" });
  if (r.status !== 0) fail("upgrade succeeded but 'fixen install' failed — run it manually");
}

async function cmdUpdate(opts) {
  const done = statusLine(`checking ${PKG.name}`);
  let latest;
  try {
    latest = await latestVersion();
  } finally {
    done();
  }
  const behind = cmpVersions(VERSION, latest) < 0;
  process.stdout.write(`local  ${OUT.bold(VERSION)}\nlatest ${OUT.bold(latest)}\n`);

  if (opts.check) {
    if (behind) {
      process.stdout.write(`${OUT.yellow("update")} available — run: ${OUT.bold("fixen update")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${OUT.green("ok")}    up to date\n`);
    return;
  }

  if (!behind) {
    process.stdout.write(`${OUT.green("ok")}    up to date\n`);
    refreshRule(opts, false);
    return;
  }

  const kind = installKind();
  if (kind !== "global") {
    const how = kind === "git" ? "git pull" : "reinstall it globally";
    process.stdout.write(
      `${OUT.yellow("warn")}  not a global install: ${OUT.dim(PKG_ROOT)}\n` +
      `      ${how} to upgrade this copy — refusing to overwrite it with npm\n`
    );
    refreshRule(opts, false);
    process.exit(1);
  }

  const r = runUpgrade(`${PKG.name}@latest`);
  if (r.error) fail(`upgrade failed: ${r.error.message}`);
  if (r.status !== 0) fail(`upgrade exited with code ${r.status}`);
  process.stdout.write(`${OUT.green("ok")}    upgraded to ${OUT.bold(latest)}\n`);
  refreshRule(opts, true);
}

// ---------------------------------------------------------------- CLI

const HELP = `fixen ${VERSION} — corrects your writing (any language) using any LLM backend

Usage:
  fixen [options] <sentence...>       correct a sentence
  echo "sentence" | fixen [options]   correct stdin
  fixen [options]                     interactive mode (TTY)
  fixen -- <word...>                  force args to be read as text, never a subcommand

  fixen install [-t <lang>] [-e] [-l <lang>] [-f <file>]...
      write the rule to ~/.config/fixen/RULE.md and add one pointer line to
      the global instructions of every installed AI CLI (claude, codex, gjc,
      gemini, qwen, opencode, windsurf, goose, crush, cline) so every normal chat
      reply ends with a correction of what you typed; -f targets any other
      tool's global instruction file
  fixen uninstall                     remove the rule and all pointer lines
  fixen status                        show where the rule is installed
  fixen update [--check]              upgrade fixen, then rewrite the rule with
                                      the new version (--check: report only)

Options:
  -b, --backend <name>   claude | codex | gjc | gemini | ollama | api
                         (default: auto-detect, or config/FIXEN_BACKEND)
  -c, --command <tmpl>   custom shell command; {prompt} expands to the prompt,
                         otherwise the prompt is piped to stdin
  -e, --explain          also explain what was fixed (config: "explain": true)
      --no-explain       no explanations, even if the config enables them
  -l, --lang <lang>      language for explanations (default: English; e.g. Korean)
  -t, --target <lang>    language being corrected (default: English)
  -m, --model <model>    model for claude/gemini/ollama/api backends
  -f, --file <path>      (install) extra instruction file to add the line to
      --check            (update) only report versions; exit 1 if outdated
  -h, --help             show this help
  -v, --version          show version

Environment:
  FIXEN_BACKEND             default backend name
  FIXEN_BACKEND_CMD         default custom command template
  FIXEN_TARGET              default language being corrected
  FIXEN_LANG                default language for explanations
  FIXEN_EXPLAIN             1/true to explain by default
  FIXEN_MODEL               default model (ollama/api)
  FIXEN_API_URL             OpenAI-compatible base URL (default: api.openai.com/v1)
  FIXEN_API_KEY             API key for the 'api' backend
  FIXEN_API_TIMEOUT         seconds before the api backend gives up (default 120; 0 = never)
  FIXEN_RETRIES             retries per backend failure (default 1; 0 = never)
  FIXEN_REGISTRY            npm registry for update (default: registry.npmjs.org)
  FIXEN_UPDATE_CMD          custom upgrade command; must contain {spec} → fixen-cli@latest
  FIXEN_DEBUG               1 to print stack traces on unexpected errors

Config (~/.config/fixen/config.json):
  { "backend": "claude", "command": null, "model": null, "lang": "Korean", "target": "English", "explain": true }

Examples:
  fixen "I has a apple"
  fixen -e -l Korean "She go to school yesterday"
  fixen -t Japanese "私は昨日学校に行きたです"
  fixen -b ollama -m llama3.1 "he dont know nothing"
  fixen -c 'my-llm --quiet {prompt}' "its a beautiful day"
  fixen install -t English -e -l Korean
  fixen install -f ~/.someai/INSTRUCTIONS.md
  fixen update --check`;

// Syntax-highlights HELP for color TTYs: bold section headers, cyan flags,
// env vars, and subcommands. Plain HELP everywhere else.
function renderHelp() {
  if (!OUT.enabled) return HELP;
  return HELP
    .replace(/^fixen [^\s]+/, (m) => `${OUT.bold(OUT.cyan("fixen"))} ${OUT.dim(m.slice(6))}`)
    .replace(/^(Usage|Options|Environment|Config[^\n]*|Examples):$/gm, (m) => OUT.bold(m))
    .replace(/^(  fixen) (install|uninstall|status|update)/gm, (_, f, sub) => `${f} ${OUT.cyan(sub)}`)
    .replace(/^(  )(-[a-zA-Z], --[a-z-]+)/gm, (_, pad, flags) => pad + OUT.cyan(flags))
    .replace(/^(  )(FIXEN_[A-Z_]+)/gm, (_, pad, v) => pad + OUT.cyan(v))
    .replace(/^(      )(--[a-z-]+)/gm, (_, pad, f) => pad + OUT.cyan(f));
}

// A flag with no value (last on the command line) must fail loudly: storing
// undefined would silently fall through to auto-detection and defaults.
function flagValue(argv, i, flag) {
  const v = argv[i + 1];
  if (v === undefined) fail(`option ${flag} requires a value (see fixen --help)`);
  return v;
}

function parseArgs(argv) {
  const opts = { words: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h": case "--help": process.stdout.write(renderHelp() + "\n"); process.exit(0);
      case "-v": case "--version": process.stdout.write(VERSION + "\n"); process.exit(0);
      case "-e": case "--explain": opts.explain = true; break;
      case "--no-explain": opts.explain = false; break;
      case "--check": opts.check = true; break;
      case "-b": case "--backend": opts.backend = flagValue(argv, i, a); i++; break;
      case "-c": case "--command": opts.command = flagValue(argv, i, a); i++; break;
      case "-l": case "--lang": opts.lang = flagValue(argv, i, a); i++; break;
      case "-t": case "--target": opts.target = flagValue(argv, i, a); i++; break;
      case "-m": case "--model": opts.model = flagValue(argv, i, a); i++; break;
      case "-f": case "--file": (opts.files ??= []).push(flagValue(argv, i, a)); i++; break;
      case "--": opts.dashdash = true; opts.words.push(...argv.slice(i + 1)); i = argv.length; break;
      default:
        if (a.startsWith("-") && a !== "-") fail(`unknown option '${a}' (see fixen --help)`);
        opts.words.push(a);
    }
  }
  return opts;
}

async function interactive(opts) {
  const backend = opts.command ? "custom" : opts.backend;
  process.stderr.write(
    `${ERR.bold(ERR.cyan("fixen"))} ${ERR.dim(`v${VERSION}`)}  ` +
    `${ERR.dim("backend")} ${ERR.bold(backend)}  ${ERR.dim("target")} ${ERR.bold(opts.target)}\n` +
    ERR.dim(`type a ${opts.target} sentence — Ctrl+D or :q to quit\n`)
  );
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: ERR.enabled ? `${ERR.cyan("❯")} ` : "fix> ",
  });
  rl.prompt();
  for await (const line of rl) {
    const s = line.trim();
    if (s === ":q" || s === ":quit") break;
    if (s) {
      const done = statusLine(backend);
      try {
        const out = await correct(s, opts);
        done();
        process.stdout.write(prettyResult(out, opts) + "\n");
      } catch (e) {
        done();
        process.stderr.write(`${ERR.red("fixen:")} ${e.message}\n`);
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
  opts.lang ??= process.env.FIXEN_LANG || cfg.lang || "English";
  opts.target ??= process.env.FIXEN_TARGET || cfg.target || "English";
  // -e / --no-explain win; only an untouched flag falls through to env, config.
  opts.explain ??= boolish(process.env.FIXEN_EXPLAIN) ?? boolish(cfg.explain) ?? false;

  // Subcommands dispatch only as a lone argument, so `fixen status is great`
  // corrects a sentence instead of running cmdStatus; `--` forces text.
  const sub = !opts.dashdash && opts.words.length === 1 ? opts.words[0] : undefined;
  if (sub === "install") { cmdInstall(opts); return; }
  if (sub === "uninstall") { cmdUninstall(); return; }
  if (sub === "status") { cmdStatus(); return; }
  if (sub === "update") { await cmdUpdate(opts); return; }

  if (!opts.command && !opts.backend) {
    opts.backend = detectBackend();
    if (!opts.backend) {
      fail(
        "no backend found. Install one of: claude, codex, gjc, gemini, ollama —\n" +
        "or set FIXEN_API_KEY, or configure a custom command (see fixen --help)."
      );
    }
  }

  const backend = opts.command ? "custom" : opts.backend;
  if (opts.words.length > 0) {
    const done = statusLine(backend);
    let out;
    try {
      out = await correct(opts.words.join(" "), opts);
    } catch (e) {
      done();
      fail(e.message);
    }
    done();
    process.stdout.write(prettyResult(out, opts) + "\n");
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) fail("empty input");
    let out;
    try {
      out = await correct(text, opts);
    } catch (e) {
      fail(e.message);
    }
    process.stdout.write(prettyResult(out, opts) + "\n");
  } else {
    await interactive(opts);
  }
}

// Run only when executed directly, so tests can require() the pure functions
// below without triggering the CLI (and its process.exit paths).
if (require.main === module) {
  main().catch((e) => {
    if (process.env.FIXEN_DEBUG) process.stderr.write((e.stack || String(e)) + "\n");
    fail(e.message);
  });
}

module.exports = {
  START_MARK,
  END_MARK,
  buildPrompt,
  cleanOutput,
  boolish,
  cmpVersions,
  pointerLine,
  ruleText,
  parseArgs,
};
