import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import piDecompression from "./index.js";

it("registers /decompress and its coffee-break alias", () => {
  const registerCommand = vi.fn();
  const on = vi.fn();
  const pi = {
    registerCommand,
    on,
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  piDecompression(pi);

  expect(registerCommand).toHaveBeenCalledWith("decompress", {
    description:
      "Decompression with handoff context (/decompress [on|off] [threshold])",
    handler: expect.any(Function),
  });
  expect(registerCommand).toHaveBeenCalledWith("break", {
    description: "Decompression alias (/break [on|off] [threshold])",
    handler: expect.any(Function),
  });
});

it("uses the same command handler for /decompress and /break", () => {
  const registerCommand = vi.fn();
  const pi = {
    registerCommand,
    on: vi.fn(),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  piDecompression(pi);

  const registrations = registerCommand.mock.calls as Array<
    [string, { handler: unknown }]
  >;
  const decompress = registrations.find(([name]) => name === "decompress");
  const breakAlias = registrations.find(([name]) => name === "break");

  expect(decompress?.[1].handler).toBe(breakAlias?.[1].handler);
  expect(registrations.some(([name]) => name === "compactor")).toBe(false);
});

it("wires turn-boundary interruption and compaction lifecycle handlers", () => {
  const on = vi.fn();
  const pi = {
    registerCommand: vi.fn(),
    on,
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  piDecompression(pi);

  expect(on).toHaveBeenCalledWith("turn_end", expect.any(Function));
  expect(on).toHaveBeenCalledWith("agent_settled", expect.any(Function));
  expect(on).toHaveBeenCalledWith("session_compact", expect.any(Function));
  expect(on).toHaveBeenCalledWith(
    "session_compact_failed",
    expect.any(Function),
  );
  expect(on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
});

it("resumes through Pi's sendUserMessage adapter after native compaction", async () => {
  const registerCommand = vi.fn();
  const on = vi.fn();
  const sendUserMessage = vi.fn();
  const pi = {
    registerCommand,
    on,
    sendUserMessage,
  } as unknown as ExtensionAPI;
  piDecompression(pi);

  const command = registerCommand.mock.calls[0]?.[1] as {
    handler: (args: string, ctx: unknown) => Promise<void>;
  };
  const handler = (name: string) =>
    on.mock.calls.find(([event]) => event === name)?.[1] as
      | ((event: unknown, ctx: unknown) => Promise<void>)
      | undefined;
  const ctx = {
    model: { id: "test-model" },
    modelRegistry: { complete: vi.fn() },
    sessionManager: { getSessionId: () => "s1" },
    cwd: "/proj",
    isProjectTrusted: () => false,
    hasUI: false,
    ui: { notify: vi.fn(), setStatus: vi.fn() },
    getContextUsage: () => ({
      tokens: 150_000,
      contextWindow: 200_000,
      percent: 75,
    }),
    hasPendingMessages: () => false,
    abort: vi.fn(),
    compact: vi.fn(),
  };

  await command.handler("on 60", ctx);
  await handler("turn_end")?.({ type: "turn_end" }, ctx);
  await handler("session_compact")?.(
    { type: "session_compact", willRetry: false },
    ctx,
  );
  await handler("agent_settled")?.({ type: "agent_settled" }, ctx);

  expect(sendUserMessage).toHaveBeenCalledWith(
    "Continue the interrupted user task using the handoff context.",
    { deliverAs: "followUp" },
  );
});
