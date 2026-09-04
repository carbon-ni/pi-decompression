import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  convertToLlm,
  serializeConversation,
  type AgentEndEvent,
  type ExtensionCommandContext,
  type ExtensionContext,
  type SessionBeforeCompactEvent,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import {
  buildHandoffCompaction,
  buildHandoffPrompt,
  isUsableHandoff,
  parseCompactorArgs,
  shouldCompactAt,
  type CompactorCommand,
  type CompactorState,
} from "../domain/compactor-policy.js";
import {
  createCompactorConfig,
  type CompactorConfigStore,
} from "./compactor-config.js";
import { createHandoffStore, type HandoffStore } from "./handoff-store.js";

const MAX_HANDOFF_TOKENS = 8192;

function defaultReportsDir(cwd: string): string {
  const base = process.env.AGENT_WORKSPACE ?? join(cwd, ".tmp");
  return join(base, "reports");
}

type CompleteResponse = Awaited<ReturnType<ExtensionContext["modelRegistry"]["complete"]>>;

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

export interface Compactor {
  readonly enabled: boolean;
  command(args: string, ctx: ExtensionCommandContext): Promise<void>;
  beforeCompact(
    event: SessionBeforeCompactEvent,
    ctx: ExtensionContext,
  ): Promise<BeforeCompactResult | undefined>;
  onAgentEnd(event: AgentEndEvent, ctx: ExtensionContext): Promise<void>;
  onSessionStart(event: SessionStartEvent, ctx: ExtensionContext): Promise<void>;
}

export function createCompactor(
  options: {
    store?: HandoffStore;
    config?: CompactorConfigStore;
    uuid?: () => string;
    now?: () => Date;
    reportsDir?: (cwd: string) => string;
  } = {},
): Compactor {
  const store = options.store ?? createHandoffStore();
  const config = options.config ?? createCompactorConfig();
  const uuid = options.uuid ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const reportsDir = options.reportsDir ?? defaultReportsDir;
  let enabled = false;
  let thresholdPercent: number | null = null;

  function currentState(): CompactorState {
    return { enabled, thresholdPercent };
  }

  async function persistState(ctx: ExtensionContext): Promise<void> {
    if (!ctx.isProjectTrusted()) return;
    try {
      await config.write(ctx.cwd, currentState());
    } catch {
      notify(ctx, "compactor: could not save state to .pi/compactor.json");
    }
  }

  async function command(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const command: CompactorCommand = parseCompactorArgs(args);
    switch (command.action) {
      case "enable":
        enabled = true;
        await persistState(ctx);
        notify(ctx, describeState());
        break;
      case "disable":
        enabled = false;
        await persistState(ctx);
        notify(ctx, describeState());
        break;
      case "status":
        notify(ctx, describeState());
        break;
      case "setThreshold":
        thresholdPercent = command.percent;
        await persistState(ctx);
        notify(ctx, describeState());
        break;
      case "invalid":
        notify(ctx, `usage: /compactor on|off|status|threshold <1-100> — ${describeState()}`);
        break;
    }
  }

  function describeState(): string {
    const threshold = thresholdPercent === null ? "none" : `${thresholdPercent}%`;
    return `compactor ${enabled ? "on" : "off"}, threshold ${threshold}`;
  }

  async function onAgentEnd(_event: AgentEndEvent, ctx: ExtensionContext): Promise<void> {
    if (!enabled || thresholdPercent === null) return;
    const percent = ctx.getContextUsage()?.percent ?? null;
    if (!shouldCompactAt(percent, thresholdPercent)) return;
    notify(ctx, `context at ${percent}%, threshold ${thresholdPercent}% — compacting`);
    // Compaction itself is not an agent run, so this cannot self-loop.
    ctx.compact();
  }

  async function onSessionStart(_event: SessionStartEvent, ctx: ExtensionContext): Promise<void> {
    if (!ctx.isProjectTrusted()) return;
    const state = await config.read(ctx.cwd);
    if (!state) return;
    enabled = state.enabled;
    thresholdPercent = state.thresholdPercent;
  }

  async function beforeCompact(
    event: SessionBeforeCompactEvent,
    ctx: ExtensionContext,
  ): Promise<BeforeCompactResult | undefined> {
    if (!enabled) return undefined;

    const { preparation } = event;
    const messages = [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages];
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
            { role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() },
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
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
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
        ...buildHandoffCompaction({
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
    onAgentEnd,
    onSessionStart,
  };
}

function notify(ctx: ExtensionContext, message: string): void {
  ctx.ui.notify(message, "info");
}
