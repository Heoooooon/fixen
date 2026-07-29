"use strict";

// fixen test suite — zero dependencies, like the CLI itself.
// Pure functions are tested in-process; anything that touches the filesystem
// runs the real binary against a throwaway HOME so the user's dotfiles are
// never in scope.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BIN = path.resolve(__dirname, "..", "bin", "fixen.js");
const fx = require(BIN);

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fixen-test-"));
}

function run(args, home, extraEnv = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      NO_COLOR: "1",
      ...extraEnv,
    },
  });
}

// Async variant: keeps this process's event loop alive while the child runs,
// so an in-process HTTP server can answer the child's requests. spawnSync
// would deadlock the pair until the child's own timeout fires.
function runAsync(args, home, extraEnv = {}) {
  const { spawn } = require("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        NO_COLOR: "1",
        ...extraEnv,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

// ------------------------------------------------------------ buildPrompt

test("buildPrompt: plain mode demands only the corrected text", () => {
  const p = fx.buildPrompt("he go", { explain: false, lang: "Korean", target: "English" });
  assert.match(p, /English writing corrector/);
  assert.match(p, /ONLY the corrected text/);
  assert.match(p, /he go/);
  assert.doesNotMatch(p, /Notes:/);
});

test("buildPrompt: explain mode pins the format and the note language", () => {
  const p = fx.buildPrompt("he go", { explain: true, lang: "Korean", target: "English" });
  assert.match(p, /Corrected: <the corrected text>/);
  assert.match(p, /Notes MUST be written in Korean/);
});

test("buildPrompt: -t switches the language being corrected", () => {
  const p = fx.buildPrompt("文", { explain: false, lang: "English", target: "Japanese" });
  assert.match(p, /Japanese writing corrector/);
});

// ------------------------------------------------------------ cleanOutput

test("cleanOutput: strips code fences", () => {
  assert.equal(fx.cleanOutput("```\nfixed.\n```"), "fixed.");
  assert.equal(fx.cleanOutput("```text\nfixed.\n```"), "fixed.");
});

test("cleanOutput: strips wrapping quotes but keeps dialogue intact", () => {
  assert.equal(fx.cleanOutput('"fixed."'), "fixed.");
  assert.equal(fx.cleanOutput('"Hi," he said, "bye."'), '"Hi," he said, "bye."');
});

test("cleanOutput: strips chat-mode footers in both known shapes", () => {
  assert.equal(fx.cleanOutput("Fixed it.\n\n---\nfixen: extra"), "Fixed it.");
  assert.equal(fx.cleanOutput("Fixed it.\n\n> **fixen** · extra"), "Fixed it.");
  assert.equal(fx.cleanOutput("Fixed it.\n> fixen · extra"), "Fixed it.");
});

// ---------------------------------------------------------------- boolish

test("boolish: JSON booleans and env strings agree", () => {
  assert.equal(fx.boolish(true), true);
  assert.equal(fx.boolish(false), false);
  for (const s of ["0", "false", "NO", "Off"]) assert.equal(fx.boolish(s), false);
  for (const s of ["1", "true", "yes", "banana"]) assert.equal(fx.boolish(s), true);
  assert.equal(fx.boolish(""), undefined);
  assert.equal(fx.boolish(undefined), undefined);
  assert.equal(fx.boolish(7), undefined);
});

// ------------------------------------------------------------ cmpVersions

test("cmpVersions: numeric triples, v prefix, build metadata", () => {
  assert.equal(fx.cmpVersions("0.1.8", "0.1.8"), 0);
  assert.equal(fx.cmpVersions("0.1.8", "0.1.9"), -1);
  assert.equal(fx.cmpVersions("v0.2.0", "0.1.9"), 1);
  assert.equal(fx.cmpVersions("1.0.0+build.5", "1.0.0"), 0);
});

test("cmpVersions: prerelease ordering is semver, not lexicographic", () => {
  assert.equal(fx.cmpVersions("1.0.0-rc.2", "1.0.0-rc.10"), -1);
  assert.equal(fx.cmpVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(fx.cmpVersions("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(fx.cmpVersions("1.0.0-2", "1.0.0-10"), -1);
});

// ---------------------------------------------------- pointerLine/ruleText

test("pointerLine: one marked line carrying target, notes, and rule pointer", () => {
  const line = fx.pointerLine(
    { target: "English", lang: "Korean", explain: true },
    "~/.config/fixen/RULE.md"
  );
  assert.ok(line.startsWith(fx.START_MARK));
  assert.ok(line.endsWith(fx.END_MARK));
  assert.match(line, /English the user wrote/);
  assert.match(line, /in Korean/);
  assert.match(line, /~\/\.config\/fixen\/RULE\.md/);
  assert.equal(line.split("\n").length, 1);
});

test("ruleText: full rule carries the target and optional note line", () => {
  const r = fx.ruleText({ target: "Japanese", lang: "Korean", explain: true });
  assert.match(r, /# fixen — Japanese correction rule/);
  assert.match(r, /written in Korean/);
  const plain = fx.ruleText({ target: "English", lang: "English", explain: false });
  assert.doesNotMatch(plain, /↳/);
});

// -------------------------------------------------------------- parseArgs

test("parseArgs: flags, words, and the -- separator", () => {
  const o = fx.parseArgs(["-e", "-l", "Korean", "-t", "French", "hello", "world"]);
  assert.equal(o.explain, true);
  assert.equal(o.lang, "Korean");
  assert.equal(o.target, "French");
  assert.deepEqual(o.words, ["hello", "world"]);
  assert.equal(fx.parseArgs(["--no-explain"]).explain, false);
  const d = fx.parseArgs(["--", "install"]);
  assert.equal(d.dashdash, true);
  assert.deepEqual(d.words, ["install"]);
});

// ------------------------------------------------------------- CLI surface

test("cli: --help and --version exit 0", () => {
  assert.equal(run(["--help"], tmpHome()).status, 0);
  const v = run(["--version"], tmpHome());
  assert.equal(v.status, 0);
  assert.match(v.stdout, /^\d+\.\d+\.\d+/);
});

test("cli: a flag with no value fails loudly", () => {
  const r = run(["-b"], tmpHome());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /requires a value/);
});

test("cli: multi-word input is a sentence, never a subcommand", () => {
  const r = run(["status", "is", "great"], tmpHome(), { FIXEN_BACKEND: "nonexistent" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown backend 'nonexistent'/);
});

test("cli: -- protects a lone subcommand word as text", () => {
  const r = run(["--", "install"], tmpHome(), { FIXEN_BACKEND: "nonexistent" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown backend 'nonexistent'/);
});

test("cli: piped stdin becomes the text to correct", () => {
  const r = spawnSync(process.execPath, [BIN], {
    encoding: "utf8",
    input: "piped text\n",
    env: { ...process.env, HOME: tmpHome(), NO_COLOR: "1", FIXEN_BACKEND: "nonexistent" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown backend 'nonexistent'/);
});

// --------------------------------------------------- install/uninstall fs

test("install/uninstall: idempotent, preserves user content, restores exactly", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"));
  const file = path.join(home, ".claude", "CLAUDE.md");
  fs.writeFileSync(file, "user stuff\n");

  assert.equal(run(["install"], home).status, 0);
  let content = fs.readFileSync(file, "utf8");
  assert.ok(content.startsWith("user stuff\n"));
  assert.equal(content.split(fx.START_MARK).length - 1, 1);
  assert.ok(fs.existsSync(path.join(home, ".config", "fixen", "RULE.md")));

  run(["install"], home); // second run: still exactly one block
  content = fs.readFileSync(file, "utf8");
  assert.equal(content.split(fx.START_MARK).length - 1, 1);

  assert.equal(run(["uninstall"], home).status, 0);
  assert.equal(fs.readFileSync(file, "utf8"), "user stuff\n");
  assert.ok(!fs.existsSync(path.join(home, ".config", "fixen", "RULE.md")));
});

test("uninstall: a file that was empty before install survives as empty", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".codex"));
  const file = path.join(home, ".codex", "AGENTS.md");
  fs.writeFileSync(file, "");

  run(["install"], home);
  assert.ok(fs.readFileSync(file, "utf8").includes(fx.START_MARK));

  run(["uninstall"], home);
  assert.ok(fs.existsSync(file));
  assert.equal(fs.readFileSync(file, "utf8"), "");
});

test("install: custom -f target is tracked and cleaned by uninstall", () => {
  const home = tmpHome();
  const custom = path.join(home, "tools", "INSTRUCTIONS.md");

  run(["install", "-f", custom], home);
  assert.ok(fs.readFileSync(custom, "utf8").includes(fx.START_MARK));

  run(["uninstall"], home);
  assert.ok(!fs.readFileSync(custom, "utf8").includes(fx.START_MARK));
});

test("install: cline gets its own rule file in the global rules dir", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, "Documents", "Cline"), { recursive: true });

  run(["install"], home);
  const file = path.join(home, "Documents", "Cline", "Rules", "fixen.md");
  assert.ok(fs.readFileSync(file, "utf8").includes(fx.START_MARK));

  run(["uninstall"], home);
  assert.ok(!fs.readFileSync(file, "utf8").includes(fx.START_MARK));
});

test("status: exits 0 and reports the rule on a clean home", () => {
  const r = run(["status"], tmpHome());
  assert.equal(r.status, 0);
  assert.match(r.stdout, /rule/);
});

// ----------------------------------------------------------------- retry

// A backend that fails once, then succeeds: the marker file counts attempts.
function transientScript(home) {
  const marker = path.join(home, "attempts");
  const script = path.join(home, "transient.sh");
  fs.writeFileSync(
    script,
    `#!/bin/sh\necho x >> "${marker}"\n` +
      `if [ "$(wc -l < "${marker}")" -le 1 ]; then\n` +
      `  echo "boom" >&2\n  exit 1\nfi\necho "corrected."\n`
  );
  return { marker, script };
}

function attemptCount(marker) {
  return fs.readFileSync(marker, "utf8").trim().split("\n").length;
}

test("retry: a transient custom-backend failure is retried and succeeds", () => {
  const home = tmpHome();
  const { marker, script } = transientScript(home);
  const r = run(["-c", `sh ${script}`, "sentence"], home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /corrected\./);
  assert.match(r.stderr, /retrying/);
  assert.equal(attemptCount(marker), 2);
});

test("retry: persistent failure stops after exactly two attempts", () => {
  const home = tmpHome();
  const marker = path.join(home, "attempts");
  const script = path.join(home, "always-fail.sh");
  fs.writeFileSync(script, `#!/bin/sh\necho x >> "${marker}"\necho "still down" >&2\nexit 1\n`);
  const r = run(["-c", `sh ${script}`, "sentence"], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /still down/);
  assert.equal(attemptCount(marker), 2);
});

test("retry: api backend retries a 500 and succeeds", async () => {
  const http = require("node:http");
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    if (requests === 1) {
      res.writeHead(500).end("upstream broke");
    } else {
      res.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ choices: [{ message: { content: "fixed." } }] }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const r = await runAsync(["-b", "api", "sentence"], tmpHome(), {
      FIXEN_API_URL: `http://127.0.0.1:${server.address().port}/v1`,
      FIXEN_API_KEY: "test-key",
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /fixed\./);
    assert.equal(requests, 2);
  } finally {
    server.close();
  }
});

test("retry: api backend bounds attempts against an always-500 server", async () => {
  const http = require("node:http");
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    res.writeHead(500).end("always down");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const r = await runAsync(["-b", "api", "sentence"], tmpHome(), {
      FIXEN_API_URL: `http://127.0.0.1:${server.address().port}/v1`,
      FIXEN_API_KEY: "test-key",
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /HTTP 500/);
    assert.equal(requests, 2);
  } finally {
    server.close();
  }
});

test("retry: FIXEN_RETRIES=0 disables retrying", () => {
  const home = tmpHome();
  const { marker, script } = transientScript(home);
  const r = run(["-c", `sh ${script}`, "sentence"], home, { FIXEN_RETRIES: "0" });
  assert.equal(r.status, 1);
  assert.equal(attemptCount(marker), 1);
});
