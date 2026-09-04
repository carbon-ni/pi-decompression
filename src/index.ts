import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCompactor } from "./infra/compactor.js";
import { createCompactorConfig } from "./infra/compactor-config.js";
import { createHandoffStore } from "./infra/handoff-store.js";

export default function piCompactor(pi: ExtensionAPI): void {
  const compactor = createCompactor({
    store: createHandoffStore(),
    config: createCompactorConfig(),
  });

  const command = {
    description: "Handoff compaction (/compactor [on|off] [threshold])",
    handler: compactor.command,
  };
  pi.registerCommand("compactor", command);
  pi.registerCommand("break", {
    description: "Handoff compaction alias (/break [on|off] [threshold])",
    handler: command.handler,
  });
  pi.on("session_start", compactor.onSessionStart);
  pi.on("session_before_compact", compactor.beforeCompact);
  pi.on("agent_end", compactor.onAgentEnd);
}
