import { spawn } from "node:child_process";

const RESULT_LIMIT = 64 * 1024;

function correctionRecord(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.original !== "string" || typeof value.corrected !== "string") return null;
  return {
    original: value.original,
    corrected: value.corrected,
    notes: Array.isArray(value.notes) ? value.notes.filter((note) => typeof note === "string") : [],
    target: typeof value.target === "string" ? value.target : "",
  };
}

export function queueFixenPrompt(text, { command = process.execPath, script = null } = {}) {
  return new Promise((resolve) => {
    const args = script
      ? [script, "--notify", "--json", "-e"]
      : ["--notify", "--json", "-e"];
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "ignore"],
      env: process.env,
    });
    let output = "";
    let settled = false;
    const finish = (record = null) => {
      if (settled) return;
      settled = true;
      resolve(record);
    };
    child.once("error", finish);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > RESULT_LIMIT) {
        child.kill();
        finish();
      }
    });
    child.once("close", (status) => {
      if (status !== 0 || !output.trim()) {
        finish();
        return;
      }
      try {
        finish(correctionRecord(JSON.parse(output)));
      } catch {
        finish();
      }
    });
    child.stdin.on("error", finish);
    child.stdin.end(text);
  });
}

export function registerFixenInputHook(pi, queue, TextComponent) {
  let agentSettled = true;
  const ready = [];

  const flush = () => {
    if (!agentSettled) return;
    while (ready.length > 0) pi.appendEntry("fixen-correction", ready.shift());
  };

  pi.registerEntryRenderer("fixen-correction", (entry, { expanded }, theme) => {
    const record = correctionRecord(entry.data);
    if (!record) return new TextComponent("", 1, 0);
    const note = record.notes[0];
    let line =
      theme.fg("toolTitle", theme.bold("fixen")) +
      " " +
      theme.fg("accent", record.corrected);
    if (note) line += " " + theme.fg("muted", `· ${note}`);
    if (expanded) {
      line += "\n" + theme.fg("dim", `original  ${record.original}`);
      for (let i = 1; i < record.notes.length; i++) {
        line += "\n" + theme.fg("dim", `          · ${record.notes[i]}`);
      }
    }
    return new TextComponent(line, 1, 0);
  });

  pi.on("before_agent_start", (event) => ({
    systemPrompt:
      event.systemPrompt +
      "\n\n" +
      "Fixen's native sidecar is active for this session. " +
      "Do not add a `fixen` correction footer to your response; " +
      "the sidecar renders the correction separately after you settle.",
  }));

  pi.on("input", (event) => {
    if (event.source === "extension") return;
    const text = typeof event.text === "string" ? event.text.trim() : "";
    if (!text) return;
    agentSettled = false;
    queue(text).then((record) => {
      if (record) ready.push(record);
      flush();
    });
  });

  pi.on("agent_settled", () => {
    agentSettled = true;
    flush();
  });
}
