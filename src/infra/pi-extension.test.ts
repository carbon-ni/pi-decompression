import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerPiCompactor, STATUS_COMMAND } from "./pi-extension.js";

function createPi() {
  return {
    registerCommand: vi.fn(),
  } as unknown as ExtensionAPI;
}

function getRegisteredCommand(pi: ExtensionAPI) {
  const command = vi.mocked(pi.registerCommand).mock.calls[0]?.[1];
  expect(command).toBeDefined();
  return command!;
}

describe("registerPiCompactor", () => {
  it("registers a status command", () => {
    const pi = createPi();

    registerPiCompactor(pi);

    expect(pi.registerCommand).toHaveBeenCalledOnce();
    expect(pi.registerCommand).toHaveBeenCalledWith(
      STATUS_COMMAND,
      expect.objectContaining({
        description: expect.any(String),
        handler: expect.any(Function),
      }),
    );
  });

  it("notifies interactive users that the extension is loaded", async () => {
    const pi = createPi();
    const notify = vi.fn();
    registerPiCompactor(pi);
    const options = getRegisteredCommand(pi);

    await options.handler("", {
      hasUI: true,
      ui: { notify },
    } as never);

    expect(notify).toHaveBeenCalledWith("pi-compactor loaded", "info");
  });

  it("does not notify in headless mode", async () => {
    const pi = createPi();
    const notify = vi.fn();
    registerPiCompactor(pi);
    const options = getRegisteredCommand(pi);

    await options.handler("", {
      hasUI: false,
      ui: { notify },
    } as never);

    expect(notify).not.toHaveBeenCalled();
  });
});
