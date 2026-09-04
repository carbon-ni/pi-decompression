import type {
  ExtensionAPI,
  SessionBeforeCompactEvent,
  SessionCompactEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piDecompression from "../index.js";
import { createDecompression } from "./decompression.js";
import { createDecompressionConfig } from "./decompression-config.js";
import { createHandoffStore, type HandoffFs } from "./handoff-store.js";

function fakeFs(): HandoffFs & {
  files: Map<string, string>;
  dirs: Set<string>;
} {
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
          .filter(
            (d) =>
              d.startsWith(prefix) && !d.slice(prefix.length).includes("/"),
          )
          .map((name) => ({
            name: name.slice(prefix.length),
            isDirectory: true,
          })),
        ...[...files.keys()]
          .filter(
            (f) =>
              f.startsWith(prefix) && !f.slice(prefix.length).includes("/"),
          )
          .map((name) => ({
            name: name.slice(prefix.length),
            isDirectory: false,
          })),
      ];
    },
  };
}

const DIR = "/proj/.tmp/reports";
const NOW = new Date(2026, 3, 13, 20, 55, 1);
const HANDOFF_FILE = `${DIR}/handoffs/2026-04-13/20-55-01--s1.md`;

type BeforeCompactCtx = Parameters<
  ReturnType<typeof createDecompression>["beforeCompact"]
>[1];
type SettledCtx = Parameters<
  ReturnType<typeof createDecompression>["onAgentSettled"]
>[1];
type CommandCtx = Parameters<
  ReturnType<typeof createDecompression>["command"]
>[1];

function makeEvent(
  overrides: Partial<SessionBeforeCompactEvent> = {},
): SessionBeforeCompactEvent {
  return {
    type: "session_before_compact",
    preparation: {
      firstKeptEntryId: "keep-1",
      messagesToSummarize: [
        { role: "user", content: "hello", timestamp: Date.now() },
      ],
      turnPrefixMessages: [],
      isSplitTurn: false,
      tokensBefore: 90_000,
      fileOps: { readFiles: [], modifiedFiles: [] },
      settings: {
        enabled: true,
        reserveTokens: 16_384,
        keepRecentTokens: 20_000,
      },
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

function createTestDecompression(
  fs: ReturnType<typeof fakeFs> = fakeFs(),
  options: Parameters<typeof createDecompression>[0] = {},
) {
  return createDecompression({
    store: createHandoffStore(fs),
    config: createDecompressionConfig(fs),
    now: () => NOW,
    reportsDir: () => DIR,
    ...options,
  });
}

function makeSettledCtx(overrides: Record<string, unknown> = {}) {
  return makeCtx<SettledCtx>({
    getContextUsage: () => ({
      tokens: 150_000,
      contextWindow: 200_000,
      percent: 75,
    }),
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
  it("decompresses when usage reaches the configured threshold", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.command("60", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("enables and arms the threshold in one command: on 60", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    expect(decompression.enabled).toBe(true);

    const ctx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("persists the combined form to config", async () => {
    const fs = fakeFs();
    const decompression = createTestDecompression(fs);
    await decompression.command("on 60", makeCtx<CommandCtx>());

    const saved = JSON.parse(
      fs.files.get("/proj/.pi/decompression.json") ?? "{}",
    ) as unknown;
    expect(saved).toEqual({ enabled: true, thresholdPercent: 60 });
  });

  it("does not decompress below the threshold", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.command("80", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("does not decompress when disabled", async () => {
    const decompression = createTestDecompression();
    await decompression.command("60", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("does not decompress when usage is unknown", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.command("60", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx({ getContextUsage: () => undefined });
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("ignores turn boundaries without usage, below threshold, or after a handled usage", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const abort = vi.fn();
    const noUsage = makeSettledCtx({ abort, getContextUsage: () => undefined });
    await decompression.onTurnEnd(makeTurnEndEvent(), noUsage);

    const below = makeSettledCtx({
      abort,
      getContextUsage: () => ({ tokens: 100, contextWindow: 200, percent: 50 }),
    });
    await decompression.onTurnEnd(makeTurnEndEvent(), below);

    const atThreshold = makeSettledCtx({ abort });
    await decompression.onTurnEnd(makeTurnEndEvent(), atThreshold);
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "manual",
        fromExtension: false,
        willRetry: false,
      } as SessionCompactEvent,
      atThreshold,
    );
    await decompression.onTurnEnd(makeTurnEndEvent(2), atThreshold);

    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("does not start a second compaction while one is active", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "manual",
        fromExtension: false,
      } as SessionCompactEvent,
      ctx,
    );
    await decompression.onSessionCompactFailed(
      {
        type: "session_compact_failed",
        reason: "manual",
        aborted: false,
        willRetry: false,
        fromExtension: false,
      },
      ctx,
    );

    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("no threshold set means no decompression watching", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());

    const ctx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("reports config write failures without breaking the command", async () => {
    const config = {
      read: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockRejectedValue(new Error("read-only")),
    };
    const decompression = createDecompression({
      store: createHandoffStore(fakeFs()),
      config,
    });
    const ctx = makeCtx<CommandCtx>();
    await decompression.command("on 60", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "decompression: could not save state to .pi/decompression.json",
      "info",
    );
  });

  it("status reports state and threshold", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.command("60", makeCtx<CommandCtx>());

    const ctx = makeCtx<CommandCtx>();
    await decompression.command("", ctx);

    const message = vi.mocked(ctx.ui.notify).mock.calls.at(-1)?.[0] as
      | string
      | undefined;
    expect(message).toContain("on");
    expect(message).toContain("60");
  });

  it("does not inspect turn usage while disabled", async () => {
    const decompression = createTestDecompression();
    const getContextUsage = vi.fn();
    await decompression.onTurnEnd(
      makeTurnEndEvent(),
      makeSettledCtx({ getContextUsage }),
    );

    expect(getContextUsage).not.toHaveBeenCalled();
  });

  it("requests a safe stop at the completed turn boundary", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);

    expect(ctx.abort).toHaveBeenCalledTimes(1);
    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("compacts once when duplicate lifecycle events race", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onTurnEnd(makeTurnEndEvent(2), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.abort).toHaveBeenCalledTimes(1);
    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });

  it("does not compact or resume after /break off wins the settle race", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.command("off", makeCtx<CommandCtx>());
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("resumes interrupted work once after successful compaction", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    options.onComplete?.({});
    options.onComplete?.({});

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("resumes after native compaction satisfies a pending interruption", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    const compactCtx = makeSettledCtx({
      getContextUsage: () => undefined,
      hasPendingMessages: undefined,
    });
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "threshold",
        fromExtension: false,
        willRetry: false,
        compactionEntry: {},
      } as SessionCompactEvent,
      compactCtx,
    );

    expect(ctx.compact).not.toHaveBeenCalled();
    await decompression.onAgentSettled({ type: "agent_settled" }, compactCtx);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("resumes after manual compaction satisfies a pending interruption", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "manual",
        fromExtension: false,
        willRetry: false,
        compactionEntry: {},
      } as SessionCompactEvent,
      ctx,
    );
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("does not synthesize after native compaction that retries or drains a queue", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({
      abort: vi.fn(),
      hasPendingMessages: () => true,
    });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "overflow",
        fromExtension: false,
        willRetry: true,
        compactionEntry: {},
      } as SessionCompactEvent,
      ctx,
    );
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("does not synthesize when native compaction succeeds with a queued message", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({
      abort: vi.fn(),
      hasPendingMessages: () => true,
    });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "threshold",
        fromExtension: false,
        willRetry: false,
      } as SessionCompactEvent,
      ctx,
    );
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(resume).not.toHaveBeenCalled();
  });

  it("reports resume failures after successful interrupted decompression", async () => {
    const resume = vi.fn(() => {
      throw "agent is unavailable";
    });
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });
    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: () => void;
    };
    options.onComplete?.();

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "decompression: could not resume interrupted work (agent is unavailable)",
      "error",
    );
  });

  it("reports cancellation when decompression has no error detail", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onError?: (error: Error) => void;
    };
    options.onError?.(undefined as unknown as Error);

    expect(vi.mocked(ctx.ui.notify).mock.calls.flat().join(" ")).toContain(
      "cancelled",
    );
  });

  it("reports Error details when resume fails with an Error", async () => {
    const resume = vi.fn(() => {
      throw new Error("agent is unavailable");
    });
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });
    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: () => void;
    };
    options.onComplete?.();

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "decompression: could not resume interrupted work (agent is unavailable)",
      "error",
    );
  });

  it("clears an in-flight continuation when /break off wins after compaction starts", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    await decompression.command("off", makeCtx<CommandCtx>());
    options.onComplete?.({});

    expect(resume).not.toHaveBeenCalled();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(ctx.compact).toHaveBeenCalledTimes(2);
  });

  it("does not synthesize continuation when a queued message exists", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({
      abort: vi.fn(),
      hasPendingMessages: () => true,
    });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    options.onComplete?.({});

    expect(resume).not.toHaveBeenCalled();
  });

  it("compacts idle threshold usage without synthetic continuation", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx();

    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onComplete?: (result: unknown) => void;
    };
    options.onComplete?.({});
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
  });

  it("reports cancellation, clears pending state, and allows a later fresh trigger", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    let usage = { tokens: 150_000, contextWindow: 200_000, percent: 75 };
    const ctx = makeSettledCtx({
      abort: vi.fn(),
      getContextUsage: () => usage,
    });

    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    const options = vi.mocked(ctx.compact).mock.calls[0]?.[0] as {
      onError?: (error: Error) => void;
    };
    options.onError?.(new Error("cancelled"));
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(ctx.compact).toHaveBeenCalledTimes(1);

    usage = { tokens: 170_000, contextWindow: 200_000, percent: 85 };
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);
    expect(ctx.compact).toHaveBeenCalledTimes(2);
    expect(resume).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.ui.notify).mock.calls.flat().join(" ")).toContain(
      "cancelled",
    );
  });

  it("clears pending work on native compaction failure", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });
    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onSessionCompactFailed(
      {
        type: "session_compact_failed",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        fromExtension: false,
      },
      ctx,
    );
    await decompression.onSessionCompactFailed(
      {
        type: "session_compact_failed",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        fromExtension: false,
      },
      makeSettledCtx({ getContextUsage: () => undefined }),
    );
    await decompression.onAgentSettled({ type: "agent_settled" }, ctx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.ui.notify).mock.calls.flat().join(" ")).toContain(
      "was not resumed",
    );
  });

  it("resets lifecycle state on shutdown", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ abort: vi.fn() });
    await decompression.onTurnEnd(makeTurnEndEvent(), ctx);
    await decompression.onSessionShutdown(
      { type: "session_shutdown", reason: "quit" },
      ctx,
    );
    const settledCtx = makeSettledCtx({ getContextUsage: () => undefined });
    await decompression.onAgentSettled({ type: "agent_settled" }, settledCtx);

    expect(ctx.compact).not.toHaveBeenCalled();
    expect(settledCtx.compact).not.toHaveBeenCalled();
  });

  it("never resumes manual compaction", async () => {
    const resume = vi.fn();
    const decompression = createTestDecompression(fakeFs(), { resume });
    await decompression.command("on 60", makeCtx<CommandCtx>());
    const ctx = makeSettledCtx({ getContextUsage: () => undefined });

    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "manual",
        fromExtension: false,
      } as SessionCompactEvent,
      ctx,
    );
    await decompression.onSessionCompact(
      {
        type: "session_compact",
        reason: "manual",
        fromExtension: false,
      } as SessionCompactEvent,
      makeSettledCtx(),
    );

    expect(resume).not.toHaveBeenCalled();
  });
});

describe("createDecompression", () => {
  it("uses default runtime dependencies when none are supplied", async () => {
    createDecompression();
    const fs = fakeFs();
    const previousWorkspace = process.env.AGENT_WORKSPACE;
    delete process.env.AGENT_WORKSPACE;
    try {
      const decompression = createDecompression({
        store: createHandoffStore(fs),
        config: createDecompressionConfig(fs),
      });
      await decompression.command("on", makeCtx<CommandCtx>());
      const result = await decompression.beforeCompact(
        makeEvent(),
        makeCtx<BeforeCompactCtx>(),
      );

      expect(result?.compaction?.summary).toContain("handoffs");
    } finally {
      if (previousWorkspace === undefined) delete process.env.AGENT_WORKSPACE;
      else process.env.AGENT_WORKSPACE = previousWorkspace;
    }
  });

  it("is disabled by default: beforeCompact does nothing", async () => {
    const decompression = createTestDecompression();
    const ctx = makeCtx<BeforeCompactCtx>();
    await expect(
      decompression.beforeCompact(makeEvent(), makeCtx<BeforeCompactCtx>()),
    ).resolves.toBeUndefined();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
  });

  it("command 'on' enables handoff decompression", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    expect(decompression.enabled).toBe(true);
  });

  it("command 'off' disables it again", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.command("off 70", makeCtx<CommandCtx>());
    expect(decompression.enabled).toBe(false);
  });

  it("command with invalid args notifies usage and keeps state", async () => {
    const decompression = createTestDecompression();
    const ctx = makeCtx<CommandCtx>();
    await decompression.command("maybe", ctx);
    expect(decompression.enabled).toBe(false);
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  it("beforeCompact writes a handoff file and returns a pointer result", async () => {
    const fs = fakeFs();
    const decompression = createTestDecompression(fs);
    await decompression.command("on", makeCtx<CommandCtx>());

    const result = await decompression.beforeCompact(
      makeEvent(),
      makeCtx<BeforeCompactCtx>(),
    );

    expect(fs.files.get(HANDOFF_FILE)).toContain("# Handoff");
    expect(result?.compaction).toMatchObject({
      firstKeptEntryId: "e2",
      tokensBefore: 90_000,
      details: { handoffPath: HANDOFF_FILE },
    });
    expect(result?.compaction?.summary).toContain(HANDOFF_FILE);
  });

  it("passes the summary usage through to the Pi compaction result", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());

    const result = await decompression.beforeCompact(
      makeEvent(),
      makeCtx<BeforeCompactCtx>(),
    );
    expect(result?.compaction?.usage).toEqual({ totalTokens: 42 });
  });

  it("feeds the previous handoff into the next prompt for cumulative summaries", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "# Handoff\ndone work" }],
      usage: { totalTokens: 42 },
    });
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.beforeCompact(
      makeEvent(),
      makeCtx<BeforeCompactCtx>({ modelRegistry: { complete } }),
    );
    await decompression.beforeCompact(
      makeEvent(),
      makeCtx<BeforeCompactCtx>({ modelRegistry: { complete } }),
    );

    const firstPrompt = complete.mock.calls.at(0)?.[1].messages[0].content[0]
      .text as string | undefined;
    const secondPrompt = complete.mock.calls.at(1)?.[1].messages[0].content[0]
      .text as string | undefined;
    expect(firstPrompt).toBeDefined();
    expect(firstPrompt).not.toContain("# Handoff");
    expect(secondPrompt).toContain("# Handoff");
  });

  it("falls back when the model is missing", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>({ model: undefined });
    await expect(
      decompression.beforeCompact(makeEvent(), ctx),
    ).resolves.toBeUndefined();
  });

  it("falls back when the model call fails", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>({
      modelRegistry: { complete: vi.fn().mockRejectedValue(new Error("boom")) },
    });
    await expect(
      decompression.beforeCompact(makeEvent(), ctx),
    ).resolves.toBeUndefined();
  });

  it("falls back when the summary is empty", async () => {
    const fs = fakeFs();
    const decompression = createTestDecompression(fs);
    await decompression.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>({
      modelRegistry: {
        complete: vi
          .fn()
          .mockResolvedValue({ content: [{ type: "text", text: "   " }] }),
      },
    });
    await expect(
      decompression.beforeCompact(makeEvent(), ctx),
    ).resolves.toBeUndefined();
    const wroteHandoff = [...fs.files.keys()].some((path) =>
      path.includes("/handoffs/"),
    );
    expect(wroteHandoff).toBe(false);
  });

  it("falls back when there are no messages to summarize", async () => {
    const decompression = createTestDecompression();
    await decompression.command("on", makeCtx<CommandCtx>());
    const ctx = makeCtx<BeforeCompactCtx>();
    const event = makeEvent({
      preparation: {
        firstKeptEntryId: "keep-1",
        messagesToSummarize: [],
        turnPrefixMessages: [],
        isSplitTurn: false,
        tokensBefore: 0,
        fileOps: { readFiles: [], modifiedFiles: [] },
        settings: {
          enabled: true,
          reserveTokens: 16_384,
          keepRecentTokens: 20_000,
        },
      },
    } as unknown as SessionBeforeCompactEvent);
    await expect(
      decompression.beforeCompact(event, ctx),
    ).resolves.toBeUndefined();
    expect(ctx.modelRegistry.complete).not.toHaveBeenCalled();
  });
});

describe("config persistence", () => {
  it("persists mutations to .pi/decompression.json", async () => {
    const fs = fakeFs();
    const decompression = createTestDecompression(fs);
    await decompression.command("on", makeCtx<CommandCtx>());
    await decompression.command("60", makeCtx<CommandCtx>());

    const saved = JSON.parse(
      fs.files.get("/proj/.pi/decompression.json") ?? "{}",
    ) as unknown;
    expect(saved).toEqual({ enabled: true, thresholdPercent: 60 });
  });

  it("does not write for status or invalid args", async () => {
    const fs = fakeFs();
    const decompression = createTestDecompression(fs);
    await decompression.command("status", makeCtx<CommandCtx>());
    await decompression.command("maybe", makeCtx<CommandCtx>());

    expect(fs.files.has("/proj/.pi/decompression.json")).toBe(false);
  });

  it("does not persist when the project is untrusted", async () => {
    const fs = fakeFs();
    const decompression = createTestDecompression(fs);
    await decompression.command(
      "on",
      makeCtx<CommandCtx>({ isProjectTrusted: () => false }),
    );

    expect(decompression.enabled).toBe(true);
    expect(fs.files.has("/proj/.pi/decompression.json")).toBe(false);
  });

  it("restores state from .pi/decompression.json on session start", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/proj/.pi/decompression.json",
      JSON.stringify({ enabled: true, thresholdPercent: 60 }),
    );
    const decompression = createTestDecompression(fs);
    await decompression.onSessionStart(
      { type: "session_start", reason: "startup" },
      makeCtx<BeforeCompactCtx>(),
    );
    expect(decompression.enabled).toBe(true);

    const settledCtx = makeSettledCtx();
    await decompression.onAgentSettled({ type: "agent_settled" }, settledCtx);
    expect(settledCtx.compact).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed config file", async () => {
    const fs = fakeFs();
    fs.files.set("/proj/.pi/decompression.json", "{broken");
    const decompression = createTestDecompression(fs);
    await decompression.onSessionStart(
      { type: "session_start", reason: "startup" },
      makeCtx<BeforeCompactCtx>(),
    );
    expect(decompression.enabled).toBe(false);
  });

  it("does not restore when the project is untrusted", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/proj/.pi/decompression.json",
      JSON.stringify({ enabled: true, thresholdPercent: 60 }),
    );
    const decompression = createTestDecompression(fs);
    await decompression.onSessionStart(
      { type: "session_start", reason: "startup" },
      makeCtx<BeforeCompactCtx>({ isProjectTrusted: () => false }),
    );
    expect(decompression.enabled).toBe(false);
  });
});

describe("index wiring", () => {
  it("registers the /decompress command and the session_before_compact handler", () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    piDecompression(pi);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "decompress",
      expect.anything(),
    );
    expect(pi.on).toHaveBeenCalledWith(
      "session_before_compact",
      expect.anything(),
    );
    expect(pi.on).toHaveBeenCalledWith("agent_settled", expect.anything());
    expect(pi.on).not.toHaveBeenCalledWith("agent_end", expect.anything());
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.anything());
  });
});
