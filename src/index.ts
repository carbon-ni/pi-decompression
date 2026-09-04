import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCompactor } from "./infra/compactor.js";
import { createCompactorConfig } from "./infra/compactor-config.js";
import { createHandoffStore } from "./infra/handoff-store.js";

export default function piCompactor(pi: ExtensionAPI): void {
  const compactor = createCompactor({
    store: createHandoffStore(),
    config: createCompactorConfig(),
  });

  pi.registerCommand("compactor", {
    description: "Toggle handoff compaction (/compactor on|off|status|threshold <1-100>)",
    handler: compactor.command,
  });
  pi.on("session_start", compactor.onSessionStart);
  pi.on("session_before_compact", compactor.beforeCompact);
  pi.on("agent_end", compactor.onAgentEnd);
}
