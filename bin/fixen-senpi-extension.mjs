import { spawn } from "node:child_process";

const FIXEN_CLI_SCRIPT = "__FIXEN_CLI_SCRIPT__";

export function queueFixenPrompt(
  text,
  { command = process.execPath, script = FIXEN_CLI_SCRIPT } = {}
) {
  return new Promise((resolve) => {
    const args = script ? [script, "--hook", "-e"] : ["--hook", "-e"];
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "ignore"],
      env: process.env,
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once("error", finish);
    child.once("close", finish);
    child.stdin.on("error", finish);
    child.stdin.end(JSON.stringify({ prompt: text }));
  });
}

export function registerFixenInputHook(pi, queue = queueFixenPrompt) {
  pi.on("input", async (event) => {
    if (event.source === "extension") return;
    const text = typeof event.text === "string" ? event.text.trim() : "";
    if (text) await queue(text);
  });
}

export default function fixenSenpiExtension(pi) {
  registerFixenInputHook(pi);
}
