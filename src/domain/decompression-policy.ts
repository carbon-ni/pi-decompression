/**
 * Pure decompression policy: command parsing, handoff prompt, and pointer summary.
 * No external imports — everything arrives as parameters.
 */

export type DecompressionCommand =
  | { action: "status" }
  | { action: "enable"; threshold: number | null }
  | { action: "disable"; threshold: number | null }
  | { action: "setThreshold"; percent: number }
  | { action: "invalid" };

/**
 * Positional syntax: /decompress [on|off] [threshold]
 * No args shows status; a bare integer sets the threshold only.
 */
export function parseDecompressionArgs(args: string): DecompressionCommand {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const percentOf = (word: string | undefined): number | undefined => {
    if (word === undefined) return undefined;
    const value = Number(word);
    return Number.isInteger(value) && value >= 1 && value <= 100
      ? value
      : undefined;
  };
  const [keyword, thresholdWord] = words;
  switch (keyword) {
    case undefined:
      return { action: "status" };
    case "on":
    case "off": {
      if (words.length > 2) return { action: "invalid" };
      const threshold = percentOf(thresholdWord);
      if (thresholdWord !== undefined && threshold === undefined)
        return { action: "invalid" };
      return keyword === "on"
        ? { action: "enable", threshold: threshold ?? null }
        : { action: "disable", threshold: threshold ?? null };
    }
    default: {
      if (words.length !== 1) return { action: "invalid" };
      const percent = percentOf(keyword);
      return percent === undefined
        ? { action: "invalid" }
        : { action: "setThreshold", percent };
    }
  }
}

/** Trigger decompression when usage percent reaches the configured threshold. */
export function shouldDecompressAt(
  contextPercent: number | null,
  thresholdPercent: number,
): boolean {
  return contextPercent !== null && contextPercent >= thresholdPercent;
}

export interface DecompressionState {
  enabled: boolean;
  thresholdPercent: number | null;
}

/** Format the additive footer status; undefined clears the item. */
export function formatDecompressionStatus(
  state: DecompressionState,
): string | undefined {
  if (!state.enabled) return undefined;
  const threshold =
    state.thresholdPercent === null
      ? "no-threshold"
      : `${state.thresholdPercent}%`;
  return `decompression on:${threshold}`;
}

/** Validate untyped config-file content; undefined means invalid. */
export function parseDecompressionState(
  data: unknown,
): DecompressionState | undefined {
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
  let best:
    | { path: string; date: string; time: string; suffix: number }
    | undefined;
  for (const path of paths) {
    const [, date, time, session, suffixText] = HANDOFF_FILE.exec(path) ?? [];
    if (!date || !time || !session || session !== sessionId) continue;
    const candidate = { path, date, time, suffix: Number(suffixText ?? 1) };
    if (
      !best ||
      candidate.date > best.date ||
      (candidate.date === best.date && candidate.time > best.time) ||
      (candidate.date === best.date &&
        candidate.time === best.time &&
        candidate.suffix > best.suffix)
    ) {
      best = candidate;
    }
  }
  return best?.path;
}

export function buildPointerSummary(handoffPath: string): string {
  return (
    `[Decompressed] The full handoff document for this session is at: ${handoffPath}\n` +
    "Read that file with your read tool NOW, before doing anything else, " +
    "to recover the working context. Do not answer from memory alone."
  );
}

export function buildHandoffPrompt(
  conversationText: string,
  previousHandoff?: string,
): string {
  const previousSection = previousHandoff
    ? `\nA handoff from an earlier decompression exists. Merge it into the new document; do not lose information.\n<previous-handoff>\n${previousHandoff}\n</previous-handoff>\n`
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

export interface HandoffDecompressionInput {
  handoffPath: string;
  branchEntryIds: readonly string[];
  fallbackFirstKeptEntryId: string;
  tokensBefore: number;
}

export interface HandoffDecompression {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details: { handoffPath: string };
}

/**
 * Keep almost nothing: only the newest branch entry survives next to the
 * pointer summary; the handoff file carries the real context.
 */
export function buildHandoffDecompression(
  input: HandoffDecompressionInput,
): HandoffDecompression {
  const firstKeptEntryId =
    input.branchEntryIds.at(-1) ?? input.fallbackFirstKeptEntryId;
  return {
    summary: buildPointerSummary(input.handoffPath),
    firstKeptEntryId,
    tokensBefore: input.tokensBefore,
    details: { handoffPath: input.handoffPath },
  };
}
