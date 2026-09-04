import type {
  ExtensionAPI,
  SessionBeforeCompactEvent,
  SessionCompactEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piCompactor from "../index.js";
import { createCompactor } from "./compactor.js";
import { createCompactorConfig } from "./compactor-config.js";
import { createHandoffStore, type HandoffFs } from "./handoff-store.js";

function fakeFs(): HandoffFs & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async mkdir(path) {
      dirs.add(path);
    },
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async readdir(path) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [
        ...[...dirs]
          .filter((d) => d.startsWith(prefix) && !d.slice(prefix.length).includes("/"))
          .map((name) => ({ name: name.slice(prefix.length), isDirectory: true })),
        ...[...files.keys()]
          .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
          .map((name) => ({ name: name.slice(prefix.length), isDirectory: false })),
      ];
    },
  };
}

const DIR = "/proj/.tmp/reports";
const NOW = new Date(2026, 3, 13, 20, 55, 1);
const HANDOFF_FILE = `${DIR}/handoffs/2026-04-13/20-55-01--s1.md`;

type BeforeCompactCtx = Parameters<ReturnType<typeof createCompactor>["beforeCompact"]>[1];
type SettledCtx = Parameters<ReturnType<typeof createCompactor>["onAgentSettled"]>[1];
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
    isProjectTrusted: () => true,
    hasUI: false,
    ui: { notify: vi.fn() },
    ...overrides,
  } as unknown as C;
}

function createTestCompactor(
  fs: ReturnType<typeof fakeFs> = fakeFs(),
  options: Parameters<typeof createCompactor>[0] = {},
) {
  return createCompactor({
    store: createHandoffStore(fs),
    config: createCompactorConfig(fs),
    now: () => NOW,
    reportsDir: () => DIR,
    ...options,
  });
}

function makeSettledCtx(overrides: Record<string, unknown> = {}) {
  return makeCtx<SettledCtx>({
    getContextUsage: () => ({ tokens: 150_000, contextWindow: 200_000, percent: 75 }),
    compact: vi.fn(),
    hasPendingMessages: () => false,
    ...overrides,
  });
}

function makeTurnEndEvent(turnIndex = 1): TurnEndEvent {
  return {
    type: "turn_end",
    turnIndex,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      stopReason: "stop",
      timestamp: Date.now(),
    },
    toolResults: [],
  } as unknown as TurnEndEvent;
}

describe("threshold watcher", () => {
  it("compacts when usage reaches the configured threshold", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.command("60", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("enables and arms the threshold in one command: on 60", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on 60", makeCtx<CommandCtx>());
    expect(compactor.enabled).toBe(true);

    const ctx = makeSettledCtx();
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("persists the combined form to config", async () => {
    const fs = fakeFs();
    const compactor = createTestCompactor(fs);
    await compactor.command("on 60", makeCtx<CommandCtx>());

    const saved = JSON.parse(fs.files.get("/proj/.pi/compactor.json") ?? "{}") as unknown;
    expect(saved).toEqual({ enabled: true, thresholdPercent: 60 });
  });

  it("does not compact below the threshold", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.command("80", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("does not compact when disabled", async () => {
    const compactor = createTestCompactor();
    await compactor.command("60", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("does not compact when usage is unknown", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.command("60", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx({ getContextUsage: () => undefined });
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("no threshold set means no watching", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("status reports state and threshold", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.command("60", makeCtx<CommandCtx>());

    const ctx = makeCtx<CommandCtx>();
    await compactor.command("", ctx);

    const message = vi.mocked(ctx.ui.notify).mock.calls.at(-1)?.[0] as string | undefined;
    expect(message).toContain("on");
    expect(message).toContain("60");
  });

  it("requests a safe stop at the completed turn boundary", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);

    expect(ctx.abort).toHaveBeenCalledTimes(1);
    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("compacts once when duplicate lifecycle events race", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onTurnEnd(makeTurnEndEvent(2), ctx);
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.abort).toHaveBeenCalledTimes(1);
    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("does not compact or resume after /break off wins the settle race", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.command("off", makeCtx<CommandCtx>());
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("resumes interrupted work once after successful compaction", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    options.onComplete?.({});
    options.onComplete?.({});

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("resumes after native compaction satisfies a pending interruption", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onSessionCompact(
      {
        type: "session_compact",
        reason: "threshold",
        fromExtension: false,
        willRetry: false,
        compactionEntry: {},
      } as SessionCompactEvent,
      ctx,
    );

    expect(ctx.compact).not.toHaveBeenCalled();
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("resumes after manual compaction satisfies a pending interruption", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onSessionCompact(
      {
        type: "session_compact",
        reason: "manual",
        fromExtension: false,
        willRetry: false,
        compactionEntry: {},
      } as SessionCompactEvent,
      ctx,
    );
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("does not synthesize after native compaction that retries or drains a queue", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn(), hasPendingMessages: () => true });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onSessionCompact(
      {
        type: "session_compact",
        reason: "overflow",
        fromExtension: false,
        willRetry: true,
        compactionEntry: {},
      } as SessionCompactEvent,
      ctx,
    );
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("clears an in-flight continuation when /break off wins after compaction starts", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    await compactor.command("off", makeCtx<CommandCtx>());
    options.onComplete?.({});

    expect(resume).not.toHaveBeenCalled();
    await compactor.command("on 60", makeCtx<CommandCtx>());
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(ctx.compact).toHaveBeenCalledTimes(2);
  });

  it("does not synthesize continuation when a queued message exists", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn(), hasPendingMessages: () => true });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    options.onComplete?.({});

    expect(resume).not.toHaveBeenCalled();
  });

  it("compacts idle threshold usage without synthetic continuation", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx();

    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    options.onComplete?.({});
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
  });

  it("reports cancellation, clears pending state, and allows a later fresh trigger", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    let usage = { tokens: 150_000, contextWindow: 200_000, percent: 75 };
    const ctx = makeSettledCtx({
      abort: vi.fn(),
      getContextUsage: () => usage,
    });

    await compactor.onTurnEnd(makeTurnEndEvent(), ctx);
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onError?: (error: Error) => void;
    };
    options.onError?.(new Error("cancelled"));
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(ctx.compact).toHaveBeenCalledTimes(1);

    usage = { tokens: 170_000, contextWindow: 200_000, percent: 85 };
    await compactor.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(ctx.compact).toHaveBeenCalledTimes(2);
    expect(resume).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.ui.notify).mock.calls.flat().join(" ")).toContain("cancelled");
  });

  it("never resumes manual compaction", async () => {
    const resume = vi.fn();
    const compactor = createTestCompactor(fakeFs(), { resume });
    await compactor.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx();

    await compactor.onSessionCompact(
      { type: "session_compact", reason: "manual", fromExtension: false } as SessionCompactEvent,
      ctx,
    );

    expect(resume).not.toHaveBeenCalled();
  });
});

describe("createCompactor", () => {
  it("is disabled by default: beforeCompact does nothing", async () => {
    const compactor = createTestCompactor();
    const ctx = makeCtx<BeforeCompactCtx>();
    await expect(
      compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>()),
    ).resolves.toBeUndefined();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
  });

  it("command 'on' enables handoff compaction", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    expect(compactor.enabled).toBe(true);
  });

  it("command 'off' disables it again", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.command("off", makeCtx<CommandCtx>());
    expect(compactor.enabled).toBe(false);
  });

  it("command with invalid args notifies usage and keeps state", async () => {
    const compactor = createTestCompactor();
    const ctx = makeCtx<CommandCtx>();
    await compactor.command("maybe", ctx);
    expect(compactor.enabled).toBe(false);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("beforeCompact writes a handoff file and returns a pointer compaction", async () => {
    const fs = fakeFs();
    const compactor = createTestCompactor(fs);
    await compactor.command("on", makeCtx<CommandCtx>());

    const result = await compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>());

    expect(fs.files.get(HANDOFF_FILE)).toContain("# Handoff");
    expect(result?.compaction).toMatchObject({
      firstKeptEntryId: "e2",
      tokensBefore: 90_000,
      details: { handoffPath: HANDOFF_FILE },
    });
    expect(result?.compaction?.summary).toContain(HANDOFF_FILE);
  });

  it("passes the summary usage through to the compaction result", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());

    const result = await compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>());
    expect(result?.compaction?.usage).toEqual({ totalTokens: 42 });
  });

  it("feeds the previous handoff into the next prompt for cumulative summaries", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "# Handoff\ndone work" }],
      usage: { totalTokens: 42 },
    });
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>({ modelRegistry: { complete } }));
    await compactor.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>({ modelRegistry: { complete } }));

    const firstPrompt = complete.mock.calls.at(0)?.[1].messages[0].content[0].text as
      | string
      | undefined;
    const secondPrompt = complete.mock.calls.at(1)?.[1].messages[0].content[0].text as
      | string
      | undefined;
    expect(firstPrompt).toBeDefined();
    expect(firstPrompt).not.toContain("# Handoff");
    expect(secondPrompt).toContain("# Handoff");
  });

  it("falls back to default compaction when the model is missing", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>({ model: undefined });
    await expect(compactor.beforeCompact(makeEvent(), ctx)).resolves.toBeUndefined();
  });

  it("falls back to default compaction when the model call fails", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>({
      modelRegistry: { complete: vi.fn().mockRejectedValue(new Error("boom")) },
    });
    await expect(compactor.beforeCompact(makeEvent(), ctx)).resolves.toBeUndefined();
  });

  it("falls back to default compaction when the summary is empty", async () => {
    const fs = fakeFs();
    const compactor = createTestCompactor(fs);
    await compactor.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>({
      modelRegistry: {
        complete: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "   " }] }),
      },
    });
    await expect(compactor.beforeCompact(makeEvent(), ctx)).resolves.toBeUndefined();
    const wroteHandoff = [...fs.files.keys()].some((path) => path.includes("/handoffs/"));
    expect(wroteHandoff).toBe(false);
  });

  it("falls back to default compaction when there are no messages to summarize", async () => {
    const compactor = createTestCompactor();
    await compactor.command("on", makeCtx<CommandCtx>());
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

describe("config persistence", () => {
  it("persists mutations to .pi/compactor.json", async () => {
    const fs = fakeFs();
    const compactor = createTestCompactor(fs);
    await compactor.command("on", makeCtx<CommandCtx>());
    await compactor.command("60", makeCtx<CommandCtx>());

    const saved = JSON.parse(fs.files.get("/proj/.pi/compactor.json") ?? "{}") as unknown;
    expect(saved).toEqual({ enabled: true, thresholdPercent: 60 });
  });

  it("does not write for status or invalid args", async () => {
    const fs = fakeFs();
    const compactor = createTestCompactor(fs);
    await compactor.command("status", makeCtx<CommandCtx>());
    await compactor.command("maybe", makeCtx<CommandCtx>());

    expect(fs.files.has("/proj/.pi/compactor.json")).toBe(false);
  });

  it("does not persist when the project is untrusted", async () => {
    const fs = fakeFs();
    const compactor = createTestCompactor(fs);
    await compactor.command("on", makeCtx<CommandCtx>({ isProjectTrusted: () => false }));

    expect(compactor.enabled).toBe(true);
    expect(fs.files.has("/proj/.pi/compactor.json")).toBe(false);
  });

  it("restores state from .pi/compactor.json on session start", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/proj/.pi/compactor.json",
      JSON.stringify({ enabled: true, thresholdPercent: 60 }),
    );
    const compactor = createTestCompactor(fs);
    await compactor.onSessionStart({ type: "session_start", reason: "startup" }, makeCtx<BeforeCompactCtx>());
    expect(compactor.enabled).toBe(true);

    const settledCtx = makeSettledCtx();
    await compactor.onAgentSettled({ type: "agent_settled" }, settledCtx);
    expect(settledCtx.compact).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed config file", async () => {
    const fs = fakeFs();
    fs.files.set("/proj/.pi/compactor.json", "{broken");
    const compactor = createTestCompactor(fs);
    await compactor.onSessionStart({ type: "session_start", reason: "startup" }, makeCtx<BeforeCompactCtx>());
    expect(compactor.enabled).toBe(false);
  });

  it("does not restore when the project is untrusted", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/proj/.pi/compactor.json",
      JSON.stringify({ enabled: true, thresholdPercent: 60 }),
    );
    const compactor = createTestCompactor(fs);
    await compactor.onSessionStart(
      { type: "session_start", reason: "startup" },
      makeCtx<BeforeCompactCtx>({ isProjectTrusted: () => false }),
    );
    expect(compactor.enabled).toBe(false);
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
    expect(pi.on).toHaveBeenCalledWith("agent_settled", expect.anything());
    expect(pi.on).not.toHaveBeenCalledWith("agent_end", expect.anything());
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.anything());
  });
});
