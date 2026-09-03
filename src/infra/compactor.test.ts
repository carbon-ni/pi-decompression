import type { ExtensionAPI, SessionBeforeCompactEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piCompactor from "../index.js";
import { createCompactor } from "./compactor.js";
import { createHandoffStore, handoffPath, type HandoffFs } from "./handoff-store.js";

function fakeFs(): HandoffFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {},
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
  };
}

const DIR = "/proj/.tmp/handoffs";
type BeforeCompactCtx = Parameters<ReturnType<typeof createCompactor>["beforeCompact"]>[1];
type CommandCtx = Parameters<ReturnType<typeof createCompactor>["command"]>[1];

function makeEvent(overrides: Partial<SessionBeforeCompactEvent> = {}): SessionBeforeCompactEvent {
  return {
    type: "session_before_compact",
    preparation: {
      firstKeptEntryId: "keep-1",
      messagesToSummarize: [{ role: "user", content: "hello", timestamp: Date.now() }],
      turnPrefixMessages: [],
      isSplitTurn: false,
      tokensBefore: 90_000,
      fileOps: { readFiles: [], modifiedFiles: [] },
      settings: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
    },
    branchEntries: [{ id: "e1" }, { id: "e2" }],
    reason: "threshold",
    willRetry: false,
    signal: new AbortController().signal,
    ...overrides,
  } as unknown as SessionBeforeCompactEvent;
}

function makeCtx<C>(overrides: Record<string, unknown> = {}): C {
  return {
    model: { id: "test-model" },
    modelRegistry: {
      complete: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "# Handoff\ndone work" }],
        usage: { totalTokens: 42 },
      }),
    },
    sessionManager: { getSessionId: () => "s1" },
    cwd: "/proj",
    hasUI: false,
    ui: { notify: vi.fn() },
    ...overrides,
  } as unknown as C;
}

describe("createCompactor", () => {
  it("is disabled by default: beforeCompact does nothing", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    const ctx = makeCtx<BeforeCompactCtx>();
    await expect(compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>())).resolves.toBeUndefined();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
  });

  it("command 'on' enables handoff compaction", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    await compactor.command("on", makeCtx());
    expect(compactor.enabled).toBe(true);
  });

  it("command 'off' disables it again", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    await compactor.command("on", makeCtx());
    await compactor.command("off", makeCtx());
    expect(compactor.enabled).toBe(false);
  });

  it("command with invalid args notifies usage and keeps state", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    const ctx = makeCtx<CommandCtx>();
    await compactor.command("maybe", ctx);
    expect(compactor.enabled).toBe(false);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("beforeCompact writes a handoff file and returns a pointer compaction", async () => {
    const fs = fakeFs();
    const compactor = createCompactor({ store: createHandoffStore(fs) });
    await compactor.command("on", makeCtx());

    const result = await compactor.beforeCompact(makeEvent(), makeCtx());
    const handoffFile = handoffPath(DIR, "s1");

    expect(fs.files.get(handoffFile)).toContain("# Handoff");
    expect(result?.compaction).toMatchObject({
      firstKeptEntryId: "e2",
      tokensBefore: 90_000,
      details: { handoffPath: handoffFile },
    });
    expect(result?.compaction?.summary).toContain(handoffFile);
  });

  it("passes the summary usage through to the compaction result", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    await compactor.command("on", makeCtx());

    const result = await compactor.beforeCompact(makeEvent(), makeCtx());
    expect(result?.compaction?.usage).toEqual({ totalTokens: 42 });
  });

  it("feeds the previous handoff into the next prompt for cumulative summaries", async () => {
    const fs = fakeFs();
    const complete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "# Handoff\ndone work" }],
      usage: { totalTokens: 42 },
    });
    const compactor = createCompactor({ store: createHandoffStore(fs) });
    await compactor.command("on", makeCtx());
    await compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>({ modelRegistry: { complete } }));
    await compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>({ modelRegistry: { complete } }));

    const firstPrompt = complete.mock.calls.at(0)?.[1].messages[0].content[0].text as string | undefined;
    const secondPrompt = complete.mock.calls.at(1)?.[1].messages[0].content[0].text as string | undefined;
    expect(firstPrompt).toBeDefined();
    expect(firstPrompt).not.toContain("# Handoff");
    expect(secondPrompt).toContain("# Handoff");
  });

  it("falls back to default compaction when the model is missing", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    await compactor.command("on", makeCtx());
    const ctx = makeCtx<BeforeCompactCtx>({ model: undefined });
    await expect(compactor.beforeCompact(makeEvent(), ctx)).resolves.toBeUndefined();
  });

  it("falls back to default compaction when the model call fails", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    await compactor.command("on", makeCtx());
    const ctx = makeCtx<BeforeCompactCtx>({
      modelRegistry: { complete: vi.fn().mockRejectedValue(new Error("boom")) },
    });
    await expect(compactor.beforeCompact(makeEvent(), ctx)).resolves.toBeUndefined();
  });

  it("falls back to default compaction when the summary is empty", async () => {
    const fs = fakeFs();
    const compactor = createCompactor({ store: createHandoffStore(fs) });
    await compactor.command("on", makeCtx());
    const ctx = makeCtx<BeforeCompactCtx>({
      modelRegistry: {
        complete: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "   " }] }),
      },
    });
    await expect(compactor.beforeCompact(makeEvent(), ctx)).resolves.toBeUndefined();
    expect(fs.files.size).toBe(0);
  });

  it("falls back to default compaction when there are no messages to summarize", async () => {
    const compactor = createCompactor({ store: createHandoffStore(fakeFs()) });
    await compactor.command("on", makeCtx());
    const ctx = makeCtx<BeforeCompactCtx>();
    const event = makeEvent({
      preparation: {
        firstKeptEntryId: "keep-1",
        messagesToSummarize: [],
        turnPrefixMessages: [],
        isSplitTurn: false,
        tokensBefore: 0,
        fileOps: { readFiles: [], modifiedFiles: [] },
        settings: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
      },
    } as unknown as SessionBeforeCompactEvent);
    await expect(compactor.beforeCompact(event, ctx)).resolves.toBeUndefined();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
  });
});

describe("index wiring", () => {
  it("registers the /compactor command and the session_before_compact handler", () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    piCompactor(pi);

    expect(pi.registerCommand).toHaveBeenCalledWith("compactor", expect.anything());
    expect(pi.on).toHaveBeenCalledWith("session_before_compact", expect.anything());
  });
});
