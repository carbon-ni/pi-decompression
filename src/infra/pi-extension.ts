import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const STATUS_COMMAND = "pi-compactor-status";

export function registerPiCompactor(pi: ExtensionAPI): void {
  pi.registerCommand(STATUS_COMMAND, {
    description: "Check whether pi-compactor is loaded",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      ctx.ui.notify("pi-compactor loaded", "info");
    },
  });
}
