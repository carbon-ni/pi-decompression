import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDecompression } from "./infra/decompression.js";
import { createDecompressionConfig } from "./infra/decompression-config.js";
import { createHandoffStore } from "./infra/handoff-store.js";

export default function piDecompression(pi: ExtensionAPI): void {
  const decompression = createDecompression({
    store: createHandoffStore(),
    config: createDecompressionConfig(),
    resume: (message) =>
      pi.sendUserMessage(message, { deliverAs: "followUp" }),
  });

  const command = {
    description:
      "Decompression with handoff context (/decompress [on|off] [threshold])",
    handler: decompression.command,
  };
  pi.registerCommand("decompress", command);
  pi.registerCommand("break", {
    description: "Decompression alias (/break [on|off] [threshold])",
    handler: command.handler,
  });
  pi.on("session_start", decompression.onSessionStart);
  pi.on("session_before_compact", decompression.beforeCompact);
  pi.on("turn_end", decompression.onTurnEnd);
  pi.on("agent_settled", decompression.onAgentSettled);
  pi.on("session_compact", decompression.onSessionCompact);
  pi.on("session_compact_failed", decompression.onSessionCompactFailed);
  pi.on("session_shutdown", decompression.onSessionShutdown);
}
