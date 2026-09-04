import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import piCompactor from "./index.js";

it("registers compactor and its coffee-break alias", () => {
  const pi = {
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  expect(pi.registerCommand).toHaveBeenCalledWith("compactor", {
    description: "Handoff compaction (/compactor [on|off] [threshold])",
    handler: expect.any(Function),
  });
  expect(pi.registerCommand).toHaveBeenCalledWith("break", {
    description: "Handoff compaction alias (/break [on|off] [threshold])",
    handler: expect.any(Function),
  });
});

it("uses the same command handler for compactor and break", () => {
  const registerCommand = vi.fn();
  const pi = {
    registerCommand,
    on: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  const registrations = registerCommand.mock.calls as Array<
    [string, { handler: unknown }]
  >;
  const compactor = registrations.find(([name]) => name === "compactor");
  const breakAlias = registrations.find(([name]) => name === "break");

  expect(compactor?.[1].handler).toBe(breakAlias?.[1].handler);
});
