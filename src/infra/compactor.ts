import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  convertToLlm,
  serializeConversation,
  type ExtensionCommandContext,
  type ExtensionContext,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import {
  buildHandoffCompaction,
  buildHandoffPrompt,
  isUsableHandoff,
  parseCompactorArgs,
} from "../domain/compactor-policy.js";
import { createHandoffStore, type HandoffStore } from "./handoff-store.js";

const HANDOFF_DIR = join(".tmp", "handoffs");
const MAX_HANDOFF_TOKENS = 8192;

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
}

export function createCompactor(options: { store?: HandoffStore; uuid?: () => string } = {}): Compactor {
  const store = options.store ?? createHandoffStore();
  const uuid = options.uuid ?? randomUUID;
  let enabled = false;

  async function command(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const action = parseCompactorArgs(args);
    if (action === "enable") {
      enabled = true;
      notify(ctx, "compactor on: compaction writes a handoff file and keeps almost nothing");
    } else if (action === "disable") {
      enabled = false;
      notify(ctx, "compactor off: default pi compaction");
    } else {
      notify(ctx, `usage: /compactor on|off (currently ${enabled ? "on" : "off"})`);
    }
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
    const dir = join(ctx.cwd, HANDOFF_DIR);
    const conversationText = serializeConversation(convertToLlm(messages));
    const previousHandoff = await store.read(dir, sessionId);
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

    const handoffFile = await store.write(dir, sessionId, handoffText);
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
  };
}

function notify(ctx: ExtensionContext, message: string): void {
  ctx.ui.notify(message, "info");
}
