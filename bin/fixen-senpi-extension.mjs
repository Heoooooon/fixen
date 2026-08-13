import { Text } from "@earendil-works/pi-tui";
import {
  queueFixenPrompt as queuePrompt,
  registerFixenInputHook,
} from "./fixen-history-core.mjs";

const FIXEN_CLI_SCRIPT = "__FIXEN_CLI_SCRIPT__";

export function queueFixenPrompt(
  text,
  { command = process.execPath, script = FIXEN_CLI_SCRIPT } = {}
) {
  return queuePrompt(text, { command, script });
}

export { registerFixenInputHook };

export default function fixenSenpiExtension(pi) {
  registerFixenInputHook(pi, queueFixenPrompt, Text);
}
