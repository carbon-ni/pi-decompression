import { describe, expect, it } from "vitest";
import {
  buildHandoffCompaction,
  buildHandoffPrompt,
  buildPointerSummary,
  isUsableHandoff,
  parseCompactorArgs,
} from "./compactor-policy.js";

describe("parseCompactorArgs", () => {
  it("enables on 'on'", () => {
    expect(parseCompactorArgs("on")).toBe("enable");
  });

  it("disables on 'off'", () => {
    expect(parseCompactorArgs("off")).toBe("disable");
  });

  it("trims and lowercases input", () => {
    expect(parseCompactorArgs("  ON  ")).toBe("enable");
    expect(parseCompactorArgs("Off")).toBe("disable");
  });

  it("rejects empty args", () => {
    expect(parseCompactorArgs("")).toBe("invalid");
    expect(parseCompactorArgs("   ")).toBe("invalid");
  });

  it("rejects unknown args", () => {
    expect(parseCompactorArgs("maybe")).toBe("invalid");
    expect(parseCompactorArgs("on off")).toBe("invalid");
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
