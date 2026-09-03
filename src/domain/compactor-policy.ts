/**
 * Pure compaction policy: command parsing, handoff prompt, and pointer summary.
 * No external imports — everything arrives as parameters.
 */

export type CompactorCommandAction = "enable" | "disable" | "invalid";

export function parseCompactorArgs(args: string): CompactorCommandAction {
  const normalized = args.trim().toLowerCase();
  if (normalized === "on") return "enable";
  if (normalized === "off") return "disable";
  return "invalid";
}

export function isUsableHandoff(text: string): boolean {
  return text.trim().length > 0;
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
