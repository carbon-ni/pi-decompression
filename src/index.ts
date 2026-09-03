import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCompactor } from "./infra/compactor.js";
import { createHandoffStore } from "./infra/handoff-store.js";

export default function piCompactor(pi: ExtensionAPI): void {
  const compactor = createCompactor({ store: createHandoffStore() });

  pi.registerCommand("compactor", {
    description: "Toggle handoff compaction (/compactor on|off)",
    handler: compactor.command,
  });
  pi.on("session_before_compact", compactor.beforeCompact);
}
