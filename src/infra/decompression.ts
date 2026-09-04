import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  convertToLlm,
  serializeConversation,
  type AgentSettledEvent,
  type ExtensionCommandContext,
  type ExtensionContext,
  type SessionBeforeCompactEvent,
  type SessionCompactEvent,
  type SessionShutdownEvent,
  type SessionStartEvent,
  type TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import {
  buildHandoffDecompression,
  buildHandoffPrompt,
  formatDecompressionStatus,
  isUsableHandoff,
  parseDecompressionArgs,
  shouldDecompressAt,
  type DecompressionCommand,
  type DecompressionState,
} from "../domain/decompression-policy.js";
import {
  createDecompressionConfig,
  type DecompressionConfigStore,
} from "./decompression-config.js";
import { createHandoffStore, type HandoffStore } from "./handoff-store.js";

const MAX_HANDOFF_TOKENS = 8192;

type UsageSnapshot = {
  tokens: number | null;
  contextWindow: number;
  percent: number;
};

function getUsage(ctx: ExtensionContext): UsageSnapshot | undefined {
  const usage = ctx.getContextUsage();
  if (usage?.percent === null || usage?.percent === undefined) return undefined;
  return {
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent,
  };
}

function sameUsage(
  left: UsageSnapshot | undefined,
  right: UsageSnapshot | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.tokens === right.tokens &&
    left.contextWindow === right.contextWindow &&
    left.percent === right.percent
  );
}

function defaultReportsDir(cwd: string): string {
  const base = process.env.AGENT_WORKSPACE ?? join(cwd, ".tmp");
  return join(base, "reports");
}

type CompleteResponse = Awaited<
  ReturnType<ExtensionContext["modelRegistry"]["complete"]>
>;

/** Structural match for the non-exported SessionBeforeCompactResult. */
export interface BeforeCompactResult {
  cancel?: boolean;
  compaction?: {
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    estimatedTokensAfter?: number;
    usage?: CompleteResponse["usage"];
    details?: { handoffPath: string };
  };
}

/** Structural match for the installed event that is not re-exported by Pi. */
export interface SessionCompactFailedEvent {
  type: "session_compact_failed";
  reason: "manual" | "threshold" | "overflow";
  errorMessage?: string;
  aborted: boolean;
  willRetry: boolean;
  fromExtension: boolean;
}

export interface Decompression {
  readonly enabled: boolean;
  command(args: string, ctx: ExtensionCommandContext): Promise<void>;
  beforeCompact(
    event: SessionBeforeCompactEvent,
    ctx: ExtensionContext,
  ): Promise<BeforeCompactResult | undefined>;
  onTurnEnd(event: TurnEndEvent, ctx: ExtensionContext): Promise<void>;
  onAgentSettled(
    event: AgentSettledEvent,
    ctx: ExtensionContext,
  ): Promise<void>;
  onSessionCompact(
    event: SessionCompactEvent,
    ctx: ExtensionContext,
  ): Promise<void>;
  onSessionCompactFailed(
    event: SessionCompactFailedEvent,
    ctx: ExtensionContext,
  ): Promise<void>;
  onSessionShutdown(
    event: SessionShutdownEvent,
    ctx: ExtensionContext,
  ): Promise<void>;
  onSessionStart(
    event: SessionStartEvent,
    ctx: ExtensionContext,
  ): Promise<void>;
}

export function createDecompression(
  options: {
    store?: HandoffStore;
    config?: DecompressionConfigStore;
    uuid?: () => string;
    now?: () => Date;
    reportsDir?: (cwd: string) => string;
    resume?: (message: string) => void;
  } = {},
): Decompression {
  const store = options.store ?? createHandoffStore();
  const config = options.config ?? createDecompressionConfig();
  const uuid = options.uuid ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const reportsDir = options.reportsDir ?? defaultReportsDir;
  let enabled = false;
  let thresholdPercent: number | null = null;
  let thresholdArmed = true;
  let nextDecompressionId = 0;
  type DecompressionRequest = {
    id: number;
    interrupted: boolean;
    usage: UsageSnapshot;
    compacted?: boolean;
  };
  let pendingDecompression: DecompressionRequest | undefined;
  let activeDecompression: DecompressionRequest | undefined;
  let lastHandledUsage: UsageSnapshot | undefined;

  function currentState(): DecompressionState {
    return { enabled, thresholdPercent };
  }

  async function persistState(ctx: ExtensionContext): Promise<void> {
    if (!ctx.isProjectTrusted()) return;
    try {
      await config.write(ctx.cwd, currentState());
    } catch {
      notify(
        ctx,
        "decompression: could not save state to .pi/decompression.json",
      );
    }
  }

  async function command(
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const command: DecompressionCommand = parseDecompressionArgs(args);
    switch (command.action) {
      case "enable":
        enabled = true;
        thresholdArmed = true;
        lastHandledUsage = undefined;
        if (command.threshold !== null) thresholdPercent = command.threshold;
        updateStatus(ctx, currentState());
        await persistState(ctx);
        notify(ctx, describeState());
        break;
      case "disable":
        enabled = false;
        thresholdArmed = true;
        pendingDecompression = undefined;
        lastHandledUsage = undefined;
        if (command.threshold !== null) thresholdPercent = command.threshold;
        updateStatus(ctx, currentState());
        await persistState(ctx);
        notify(ctx, describeState());
        break;
      case "status":
        notify(ctx, describeState());
        break;
      case "setThreshold":
        thresholdPercent = command.percent;
        thresholdArmed = true;
        lastHandledUsage = undefined;
        updateStatus(ctx, currentState());
        await persistState(ctx);
        notify(ctx, describeState());
        break;
      case "invalid":
        notify(
          ctx,
          `usage: /decompress [on|off] [threshold] — ${describeState()}`,
        );
        break;
    }
  }

  function describeState(): string {
    const threshold =
      thresholdPercent === null ? "none" : `${thresholdPercent}%`;
    return `decompression ${enabled ? "on" : "off"}, threshold ${threshold}`;
  }

  async function onTurnEnd(
    _event: TurnEndEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (!enabled || thresholdPercent === null) return;
    const usage = getUsage(ctx);
    if (!usage) return;
    if (!shouldDecompressAt(usage.percent, thresholdPercent)) return;
    if (sameUsage(usage, lastHandledUsage)) return;
    if (pendingDecompression || activeDecompression) return;

    pendingDecompression = {
      id: ++nextDecompressionId,
      interrupted: true,
      usage,
    };
    notify(
      ctx,
      `context at ${usage.percent}%, threshold ${thresholdPercent}% — stopping at turn boundary`,
    );
    // turn_end is emitted after all tool results. Aborting here prevents the next
    // assistant turn while preserving the completed turn and queued messages.
    ctx.abort();
  }

  async function onAgentSettled(
    _event: AgentSettledEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (pendingDecompression) {
      if (pendingDecompression.compacted) {
        const request = pendingDecompression;
        pendingDecompression = undefined;
        resumeInterrupted(ctx, request);
      } else {
        startDecompression(ctx, pendingDecompression);
      }
      return;
    }

    if (!enabled || thresholdPercent === null || activeDecompression) return;
    const usage = getUsage(ctx);
    if (!usage) return;
    if (!shouldDecompressAt(usage.percent, thresholdPercent)) {
      thresholdArmed = true;
      return;
    }
    if (!thresholdArmed || sameUsage(usage, lastHandledUsage)) return;

    const idleDecompression = {
      id: ++nextDecompressionId,
      interrupted: false,
      usage,
    };
    pendingDecompression = idleDecompression;
    startDecompression(ctx, idleDecompression);
  }

  function startDecompression(
    ctx: ExtensionContext,
    request: DecompressionRequest,
  ): void {
    if (activeDecompression || pendingDecompression?.id !== request.id) return;
    activeDecompression = request;
    notify(
      ctx,
      `context at ${request.usage.percent}%, threshold ${thresholdPercent}% — decompressing`,
    );
    ctx.compact({
      onComplete: () => finishDecompression(ctx, request, true),
      onError: (error) => finishDecompression(ctx, request, false, error),
    });
  }

  function finishDecompression(
    ctx: ExtensionContext,
    request: DecompressionRequest,
    succeeded: boolean,
    error?: Error,
  ): void {
    if (activeDecompression?.id !== request.id) return;
    const wasPending = pendingDecompression?.id === request.id;
    activeDecompression = undefined;
    if (wasPending) pendingDecompression = undefined;
    lastHandledUsage = enabled ? request.usage : undefined;

    if (!succeeded) {
      const detail = error?.message || "cancelled";
      notify(
        ctx,
        `decompression: automatic decompression failed (${detail}); interrupted work was not resumed`,
        "error",
      );
      return;
    }

    if (!wasPending) return;
    thresholdArmed = false;
    resumeInterrupted(ctx, request);
  }

  function resumeInterrupted(
    ctx: ExtensionContext,
    request: DecompressionRequest,
  ): void {
    if (
      !request.interrupted ||
      !enabled ||
      (ctx.hasPendingMessages?.() ?? false)
    )
      return;
    try {
      options.resume?.(
        "Continue the interrupted user task using the handoff context.",
      );
    } catch (resumeError) {
      const detail =
        resumeError instanceof Error
          ? resumeError.message
          : String(resumeError);
      notify(
        ctx,
        `decompression: could not resume interrupted work (${detail})`,
        "error",
      );
    }
  }

  async function onSessionCompact(
    event: SessionCompactEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    // Our own Pi compaction is completed through onComplete. A Pi/manual compaction
    // also satisfies an interrupted request, but Pi will retry or drain queued
    // messages itself when indicated by the event.
    if (activeDecompression) return;
    const request = pendingDecompression;
    if (request) {
      const hasQueuedMessages = ctx.hasPendingMessages?.() ?? false;
      if (event.willRetry || hasQueuedMessages) {
        pendingDecompression = undefined;
      } else {
        request.compacted = true;
      }
      thresholdArmed = false;
      const usage = getUsage(ctx);
      lastHandledUsage = usage ?? request.usage;
      return;
    }
    const usage = getUsage(ctx);
    if (usage) lastHandledUsage = usage;
  }

  async function onSessionCompactFailed(
    _event: SessionCompactFailedEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    // Automatic failures call this before the compact() callback; let that
    // callback own reporting and cleanup. Pi-native/manual failures must not
    // leave an automatic request armed for a later settle event.
    if (activeDecompression) return;
    const request = pendingDecompression;
    pendingDecompression = undefined;
    const usage = getUsage(ctx);
    if (usage) lastHandledUsage = usage;
    if (request?.interrupted) {
      notify(
        ctx,
        "decompression: could not complete; interrupted work was not resumed",
        "error",
      );
    }
  }

  async function onSessionShutdown(
    _event: SessionShutdownEvent,
    _ctx: ExtensionContext,
  ): Promise<void> {
    pendingDecompression = undefined;
    activeDecompression = undefined;
    lastHandledUsage = undefined;
  }

  async function onSessionStart(
    _event: SessionStartEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    pendingDecompression = undefined;
    activeDecompression = undefined;
    lastHandledUsage = undefined;
    enabled = false;
    thresholdPercent = null;
    thresholdArmed = true;
    updateStatus(ctx, currentState());
    if (!ctx.isProjectTrusted()) return;
    const state = await config.read(ctx.cwd);
    if (!state) return;
    enabled = state.enabled;
    thresholdPercent = state.thresholdPercent;
    updateStatus(ctx, currentState());
  }

  async function beforeCompact(
    event: SessionBeforeCompactEvent,
    ctx: ExtensionContext,
  ): Promise<BeforeCompactResult | undefined> {
    if (!enabled) return undefined;

    const { preparation } = event;
    const messages = [
      ...preparation.messagesToSummarize,
      ...preparation.turnPrefixMessages,
    ];
    if (messages.length === 0) return undefined;

    const model = ctx.model;
    if (!model) return undefined;

    const sessionId = ctx.sessionManager.getSessionId();
    const dir = reportsDir(ctx.cwd);
    const conversationText = serializeConversation(convertToLlm(messages));
    const previousHandoff = await store.readLatest(dir, sessionId);
    const prompt = buildHandoffPrompt(conversationText, previousHandoff);

    let handoffText: string;
    let usage: CompleteResponse["usage"];
    try {
      const response = await ctx.modelRegistry.complete(
        model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          maxTokens: MAX_HANDOFF_TOKENS,
          signal: event.signal,
          cacheRetention: "none",
          sessionId: uuid(),
        },
      );
      handoffText = response.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
      usage = response.usage;
    } catch {
      return undefined;
    }

    if (!isUsableHandoff(handoffText)) return undefined;

    const handoffFile = await store.write(dir, sessionId, handoffText, now());
    return {
      compaction: {
        ...buildHandoffDecompression({
          handoffPath: handoffFile,
          branchEntryIds: event.branchEntries.map((entry) => entry.id),
          fallbackFirstKeptEntryId: preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
        }),
        usage,
      },
    };
  }

  return {
    get enabled() {
      return enabled;
    },
    command,
    beforeCompact,
    onTurnEnd,
    onAgentSettled,
    onSessionCompact,
    onSessionCompactFailed,
    onSessionShutdown,
    onSessionStart,
  };
}

function notify(
  ctx: ExtensionContext,
  message: string,
  type: "info" | "error" = "info",
): void {
  ctx.ui.notify(message, type);
}

function updateStatus(ctx: ExtensionContext, state: DecompressionState): void {
  ctx.ui.setStatus("decompression", formatDecompressionStatus(state));
}
