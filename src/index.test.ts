import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import piCompactor from "./index.js";

it("registers compactor and its coffee-break alias", () => {
  const registerCommand = vi.fn();
  const on = vi.fn();
  const pi = {
    registerCommand,
    on,
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  expect(registerCommand).toHaveBeenCalledWith("compactor", {
    description: "Handoff compaction (/compactor [on|off] [threshold])",
    handler: expect.any(Function),
  });
  expect(registerCommand).toHaveBeenCalledWith("break", {
    description: "Handoff compaction alias (/break [on|off] [threshold])",
    handler: expect.any(Function),
  });
});

it("uses the same command handler for compactor and break", () => {
  const registerCommand = vi.fn();
  const pi = {
    registerCommand,
    on: vi.fn(),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  const registrations = registerCommand.mock.calls as Array<
    [string, { handler: unknown }]
  >;
  const compactor = registrations.find(([name]) => name === "compactor");
  const breakAlias = registrations.find(([name]) => name === "break");

  expect(compactor?.[1].handler).toBe(breakAlias?.[1].handler);
});

it("wires turn-boundary interruption and compaction lifecycle handlers", () => {
  const on = vi.fn();
  const pi = {
    registerCommand: vi.fn(),
    on,
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  expect(on).toHaveBeenCalledWith("turn_end", expect.any(Function));
  expect(on).toHaveBeenCalledWith("agent_settled", expect.any(Function));
  expect(on).toHaveBeenCalledWith("session_compact", expect.any(Function));
  expect(on).toHaveBeenCalledWith(
    "session_compact_failed",
    expect.any(Function),
  );
  expect(on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
});
