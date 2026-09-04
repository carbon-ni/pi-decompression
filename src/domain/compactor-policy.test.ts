import { describe, expect, it } from "vitest";
import {
  buildHandoffCompaction,
  buildHandoffPrompt,
  buildHandoffRelativePath,
  buildPointerSummary,
  isUsableHandoff,
  latestHandoffPath,
  parseCompactorArgs,
  parseCompactorState,
  shouldCompactAt,
} from "./compactor-policy.js";

describe("parseCompactorArgs", () => {
  it("shows status on empty args", () => {
    expect(parseCompactorArgs("")).toEqual({ action: "status" });
    expect(parseCompactorArgs("   ")).toEqual({ action: "status" });
  });

  it("enables on 'on'", () => {
    expect(parseCompactorArgs("on")).toEqual({ action: "enable", threshold: null });
  });

  it("disables on 'off'", () => {
    expect(parseCompactorArgs("off")).toEqual({ action: "disable", threshold: null });
  });

  it("parses a bare threshold as setThreshold", () => {
    expect(parseCompactorArgs("60")).toEqual({ action: "setThreshold", percent: 60 });
  });

  it("parses toggle with threshold in one command", () => {
    expect(parseCompactorArgs("on 60")).toEqual({ action: "enable", threshold: 60 });
    expect(parseCompactorArgs("off 60")).toEqual({ action: "disable", threshold: 60 });
  });

  it("trims and lowercases input", () => {
    expect(parseCompactorArgs("  ON  ")).toEqual({ action: "enable", threshold: null });
    expect(parseCompactorArgs(" Off ")).toEqual({ action: "disable", threshold: null });
    expect(parseCompactorArgs("ON 75")).toEqual({ action: "enable", threshold: 75 });
  });

  it("rejects unknown args", () => {
    expect(parseCompactorArgs("maybe")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("status")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("threshold 60")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("on off")).toEqual({ action: "invalid" });
  });

  it("rejects malformed thresholds", () => {
    expect(parseCompactorArgs("on abc")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("on 0")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("on 101")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("on 60.5")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("on 60 70")).toEqual({ action: "invalid" });
    expect(parseCompactorArgs("60 70")).toEqual({ action: "invalid" });
  });
});

describe("shouldCompactAt", () => {
  it("compacts when usage reaches the threshold", () => {
    expect(shouldCompactAt(60, 60)).toBe(true);
    expect(shouldCompactAt(75, 60)).toBe(true);
  });

  it("waits below the threshold", () => {
    expect(shouldCompactAt(59, 60)).toBe(false);
  });

  it("never compacts on unknown usage", () => {
    expect(shouldCompactAt(null, 60)).toBe(false);
  });
});

describe("isUsableHandoff", () => {
  it("accepts non-empty text", () => {
    expect(isUsableHandoff("# Handoff\ncontent")).toBe(true);
  });

  it("rejects empty or whitespace-only text", () => {
    expect(isUsableHandoff("")).toBe(false);
    expect(isUsableHandoff("  \n\t  ")).toBe(false);
  });
});

describe("buildPointerSummary", () => {
  it("includes the handoff path and a read instruction", () => {
    const summary = buildPointerSummary("/proj/.tmp/handoffs/handoff-s1.md");
    expect(summary).toContain("/proj/.tmp/handoffs/handoff-s1.md");
    expect(summary.toLowerCase()).toContain("read");
  });
});

describe("buildHandoffPrompt", () => {
  it("embeds the conversation text", () => {
    const prompt = buildHandoffPrompt("[User]: fix the bug");
    expect(prompt).toContain("[User]: fix the bug");
  });

  it("includes the previous handoff when provided", () => {
    const prompt = buildHandoffPrompt("conversation", "old handoff content");
    expect(prompt).toContain("old handoff content");
  });

  it("omits the previous handoff section when absent", () => {
    const prompt = buildHandoffPrompt("conversation");
    expect(prompt).not.toContain("previous");
  });
});

describe("buildHandoffRelativePath", () => {
  it("formats handoffs/<date>/<time>--<session>.md from local time", () => {
    const now = new Date(2026, 3, 13, 20, 55, 1);
    expect(buildHandoffRelativePath(now, "s1")).toBe("handoffs/2026-04-13/20-55-01--s1.md");
  });

  it("pads single-digit components", () => {
    const now = new Date(2026, 0, 2, 3, 4, 5);
    expect(buildHandoffRelativePath(now, "s1")).toBe("handoffs/2026-01-02/03-04-05--s1.md");
  });
});

describe("latestHandoffPath", () => {
  it("returns undefined when there are no candidates", () => {
    expect(latestHandoffPath([], "s1")).toBeUndefined();
  });

  it("picks the newest stamp for the session, ignoring other sessions", () => {
    const paths = [
      "handoffs/2026-04-13/09-00-00--s1.md",
      "handoffs/2026-04-13/20-55-01--other.md",
      "handoffs/2026-04-13/20-55-01--s1.md",
    ];
    expect(latestHandoffPath(paths, "s1")).toBe("handoffs/2026-04-13/20-55-01--s1.md");
  });

  it("prefers a higher conflict suffix at the same stamp", () => {
    const paths = [
      "handoffs/2026-04-13/20-55-01--s1.md",
      "handoffs/2026-04-13/20-55-01--s1--2.md",
    ];
    expect(latestHandoffPath(paths, "s1")).toBe("handoffs/2026-04-13/20-55-01--s1--2.md");
  });

  it("compares date directories before time", () => {
    const paths = [
      "handoffs/2026-04-12/23-59-59--s1.md",
      "handoffs/2026-04-13/00-00-01--s1.md",
    ];
    expect(latestHandoffPath(paths, "s1")).toBe("handoffs/2026-04-13/00-00-01--s1.md");
  });

  it("ignores non-matching files", () => {
    const paths = ["README.md", "handoffs/2026-04-13/09-00-00--other.md"];
    expect(latestHandoffPath(paths, "s1")).toBeUndefined();
  });
});

describe("parseCompactorState", () => {
  it("parses a valid state", () => {
    expect(parseCompactorState({ enabled: true, thresholdPercent: 60 })).toEqual({
      enabled: true,
      thresholdPercent: 60,
    });
    expect(parseCompactorState({ enabled: false, thresholdPercent: null })).toEqual({
      enabled: false,
      thresholdPercent: null,
    });
  });

  it("rejects non-objects, missing fields, and bad types", () => {
    expect(parseCompactorState(null)).toBeUndefined();
    expect(parseCompactorState("on")).toBeUndefined();
    expect(parseCompactorState({})).toBeUndefined();
    expect(parseCompactorState({ enabled: "yes", thresholdPercent: 60 })).toBeUndefined();
    expect(parseCompactorState({ enabled: true })).toBeUndefined();
  });

  it("rejects out-of-range thresholds", () => {
    expect(parseCompactorState({ enabled: true, thresholdPercent: 0 })).toBeUndefined();
    expect(parseCompactorState({ enabled: true, thresholdPercent: 101 })).toBeUndefined();
    expect(parseCompactorState({ enabled: true, thresholdPercent: 60.5 })).toBeUndefined();
    expect(parseCompactorState({ enabled: true, thresholdPercent: "60" })).toBeUndefined();
  });
});

describe("buildHandoffCompaction", () => {
  it("keeps almost nothing: the last branch entry", () => {
    const result = buildHandoffCompaction({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
      branchEntryIds: ["e1", "e2", "e3"],
      fallbackFirstKeptEntryId: "keep-1",
      tokensBefore: 90_000,
    });
    expect(result.firstKeptEntryId).toBe("e3");
  });

  it("falls back to the preparation keep point when the branch is empty", () => {
    const result = buildHandoffCompaction({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
      branchEntryIds: [],
      fallbackFirstKeptEntryId: "keep-1",
      tokensBefore: 90_000,
    });
    expect(result.firstKeptEntryId).toBe("keep-1");
  });

  it("points the summary at the handoff file and persists the path in details", () => {
    const result = buildHandoffCompaction({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
      branchEntryIds: ["e1"],
      fallbackFirstKeptEntryId: "keep-1",
      tokensBefore: 90_000,
    });
    expect(result.summary).toContain("/proj/.tmp/handoffs/handoff-s1.md");
    expect(result.tokensBefore).toBe(90_000);
    expect(result.details).toEqual({ handoffPath: "/proj/.tmp/handoffs/handoff-s1.md" });
  });
});
