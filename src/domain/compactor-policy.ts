/**
 * Pure compaction policy: command parsing, handoff prompt, and pointer summary.
 * No external imports — everything arrives as parameters.
 */

export type CompactorCommand =
  | { action: "enable" }
  | { action: "disable" }
  | { action: "status" }
  | { action: "setThreshold"; percent: number }
  | { action: "invalid" };

export function parseCompactorArgs(args: string): CompactorCommand {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const [keyword, ...rest] = words;
  switch (keyword) {
    case "on":
      return rest.length === 0 ? { action: "enable" } : { action: "invalid" };
    case "off":
      return rest.length === 0 ? { action: "disable" } : { action: "invalid" };
    case "status":
      return rest.length === 0 ? { action: "status" } : { action: "invalid" };
    case "threshold": {
      const percent = Number(rest[0]);
      if (rest.length !== 1 || !Number.isInteger(percent) || percent < 1 || percent > 100) {
        return { action: "invalid" };
      }
      return { action: "setThreshold", percent };
    }
    default:
      return { action: "invalid" };
  }
}

/** Trigger the custom threshold compaction when usage percent reaches the threshold. */
export function shouldCompactAt(contextPercent: number | null, thresholdPercent: number): boolean {
  return contextPercent !== null && contextPercent >= thresholdPercent;
}

export interface CompactorState {
  enabled: boolean;
  thresholdPercent: number | null;
}

/** Validate untyped config-file content; undefined means invalid. */
export function parseCompactorState(data: unknown): CompactorState | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as Record<string, unknown>;
  const { enabled, thresholdPercent } = record;
  if (typeof enabled !== "boolean") return undefined;
  if (!("thresholdPercent" in record)) return undefined;
  if (
    thresholdPercent !== null &&
    (typeof thresholdPercent !== "number" ||
      !Number.isInteger(thresholdPercent) ||
      thresholdPercent < 1 ||
      thresholdPercent > 100)
  ) {
    return undefined;
  }
  return { enabled, thresholdPercent };
}

export function isUsableHandoff(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Path relative to the reports directory, mirroring the dear-diary layout:
 * handoffs/<YYYY-MM-DD>/<HH-MM-SS>--<sessionId>.md (local time).
 */
export function buildHandoffRelativePath(now: Date, sessionId: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `handoffs/${date}/${time}--${sessionId}.md`;
}

const HANDOFF_FILE =
  /handoffs\/(\d{4}-\d{2}-\d{2})\/(\d{2}-\d{2}-\d{2})--(.+?)(?:--(\d+))?\.md$/;

/** Pick the newest handoff for a session from relative paths (date, then time, then suffix). */
export function latestHandoffPath(
  paths: readonly string[],
  sessionId: string,
): string | undefined {
  let best: { path: string; date: string; time: string; suffix: number } | undefined;
  for (const path of paths) {
    const [, date, time, session, suffixText] = HANDOFF_FILE.exec(path) ?? [];
    if (!date || !time || !session || session !== sessionId) continue;
    const candidate = { path, date, time, suffix: Number(suffixText ?? 1) };
    if (
      !best ||
      candidate.date > best.date ||
      (candidate.date === best.date && candidate.time > best.time) ||
      (candidate.date === best.date && candidate.time === best.time && candidate.suffix > best.suffix)
    ) {
      best = candidate;
    }
  }
  return best?.path;
}

export function buildPointerSummary(handoffPath: string): string {
  return (
    `[Compacted] The full handoff document for this session is at: ${handoffPath}\n` +
    "Read that file with your read tool NOW, before doing anything else, " +
    "to recover the working context. Do not answer from memory alone."
  );
}

export function buildHandoffPrompt(conversationText: string, previousHandoff?: string): string {
  const previousSection = previousHandoff
    ? `\nA handoff from an earlier compaction exists. Merge it into the new document; do not lose information.\n<previous-handoff>\n${previousHandoff}\n</previous-handoff>\n`
    : "";
  return (
    "You are writing a handoff document for a future instance of this coding agent.\n" +
    "Summarize the conversation below into one complete handoff document that lets work continue seamlessly.\n\n" +
    "Required sections:\n" +
    "## Goal\n## Constraints & Preferences\n## Progress (Done / In Progress / Blocked)\n" +
    "## Key Decisions\n## Next Steps\n## Critical Context\n## Files (read and modified, with paths)\n\n" +
    "Be specific: file paths, commands, decisions with rationale. Do not continue the conversation; " +
    "only output the handoff document.\n" +
    previousSection +
    `\n<conversation>\n${conversationText}\n</conversation>`
  );
}

export interface HandoffCompactionInput {
  handoffPath: string;
  branchEntryIds: readonly string[];
  fallbackFirstKeptEntryId: string;
  tokensBefore: number;
}

export interface HandoffCompaction {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details: { handoffPath: string };
}

/**
 * Keep almost nothing: only the newest branch entry survives next to the
 * pointer summary; the handoff file carries the real context.
 */
export function buildHandoffCompaction(input: HandoffCompactionInput): HandoffCompaction {
  const firstKeptEntryId = input.branchEntryIds.at(-1) ?? input.fallbackFirstKeptEntryId;
  return {
    summary: buildPointerSummary(input.handoffPath),
    firstKeptEntryId,
    tokensBefore: input.tokensBefore,
    details: { handoffPath: input.handoffPath },
  };
}
