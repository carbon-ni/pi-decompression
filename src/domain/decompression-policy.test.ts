import { describe, expect, it } from "vitest";
import {
  buildHandoffDecompression,
  buildHandoffPrompt,
  buildHandoffRelativePath,
  buildPointerSummary,
  formatDecompressionStatus,
  isUsableHandoff,
  latestHandoffPath,
  parseDecompressionArgs,
  parseDecompressionState,
  shouldDecompressAt,
} from "./decompression-policy.js";

describe("parseDecompressionArgs", () => {
  it("shows status on empty args", () => {
    expect(parseDecompressionArgs("")).toEqual({ action: "status" });
    expect(parseDecompressionArgs("   ")).toEqual({ action: "status" });
  });

  it("enables on 'on'", () => {
    expect(parseDecompressionArgs("on")).toEqual({
      action: "enable",
      threshold: null,
    });
  });

  it("disables on 'off'", () => {
    expect(parseDecompressionArgs("off")).toEqual({
      action: "disable",
      threshold: null,
    });
  });

  it("parses now as an immediate decompression request", () => {
    expect(parseDecompressionArgs("now")).toEqual({ action: "decompressNow" });
    expect(parseDecompressionArgs("NOW")).toEqual({ action: "decompressNow" });
  });

  it("rejects now with extra arguments or as a toggle threshold", () => {
    expect(parseDecompressionArgs("now 60")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("now please")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("on now")).toEqual({ action: "invalid" });
  });

  it("parses a bare threshold as setThreshold", () => {
    expect(parseDecompressionArgs("60")).toEqual({
      action: "setThreshold",
      percent: 60,
    });
  });

  it("parses toggle with threshold in one command", () => {
    expect(parseDecompressionArgs("on 60")).toEqual({
      action: "enable",
      threshold: 60,
    });
    expect(parseDecompressionArgs("off 60")).toEqual({
      action: "disable",
      threshold: 60,
    });
  });

  it("trims and lowercases input", () => {
    expect(parseDecompressionArgs("  ON  ")).toEqual({
      action: "enable",
      threshold: null,
    });
    expect(parseDecompressionArgs(" Off ")).toEqual({
      action: "disable",
      threshold: null,
    });
    expect(parseDecompressionArgs("ON 75")).toEqual({
      action: "enable",
      threshold: 75,
    });
  });

  it("rejects unknown args", () => {
    expect(parseDecompressionArgs("maybe")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("status")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("threshold 60")).toEqual({
      action: "invalid",
    });
    expect(parseDecompressionArgs("on off")).toEqual({ action: "invalid" });
  });

  it("rejects malformed thresholds", () => {
    expect(parseDecompressionArgs("on abc")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("on 0")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("on 101")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("on 60.5")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("on 60 70")).toEqual({ action: "invalid" });
    expect(parseDecompressionArgs("60 70")).toEqual({ action: "invalid" });
  });
});

describe("formatDecompressionStatus", () => {
  it.each([
    [undefined, 60, "--"],
    [null, 60, "--"],
    [10, 50, "40%"],
    [44.98, 60, "16%"],
    [45, 60, "15%"],
    [59.99, 60, "1%"],
    [60, 60, "0%"],
    [75, 60, "0%"],
    [99.99, 60, "0%"],
    [100, 60, "0%"],
    [105, 60, "0%"],
  ] as const)(
    "formats %s usage with threshold %s",
    (usage, threshold, expected) => {
      expect(
        formatDecompressionStatus(
          { enabled: true, thresholdPercent: threshold },
          usage,
        ),
      ).toBe(expected);
    },
  );

  it("formats enabled state without a threshold", () => {
    expect(
      formatDecompressionStatus({ enabled: true, thresholdPercent: null }, 45),
    ).toBe("on:no-threshold");
  });

  it("clears disabled state", () => {
    expect(
      formatDecompressionStatus({ enabled: false, thresholdPercent: 60 }, 45),
    ).toBeUndefined();
  });
});

describe("shouldDecompressAt", () => {
  it("decompresses when usage reaches the threshold", () => {
    expect(shouldDecompressAt(60, 60)).toBe(true);
    expect(shouldDecompressAt(75, 60)).toBe(true);
  });

  it("waits below the threshold", () => {
    expect(shouldDecompressAt(59, 60)).toBe(false);
  });

  it("never decompresses on unknown usage", () => {
    expect(shouldDecompressAt(null, 60)).toBe(false);
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
    expect(buildHandoffRelativePath(now, "s1")).toBe(
      "handoffs/2026-04-13/20-55-01--s1.md",
    );
  });

  it("pads single-digit components", () => {
    const now = new Date(2026, 0, 2, 3, 4, 5);
    expect(buildHandoffRelativePath(now, "s1")).toBe(
      "handoffs/2026-01-02/03-04-05--s1.md",
    );
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
    expect(latestHandoffPath(paths, "s1")).toBe(
      "handoffs/2026-04-13/20-55-01--s1.md",
    );
  });

  it("prefers a higher conflict suffix at the same stamp", () => {
    const paths = [
      "handoffs/2026-04-13/20-55-01--s1.md",
      "handoffs/2026-04-13/20-55-01--s1--2.md",
    ];
    expect(latestHandoffPath(paths, "s1")).toBe(
      "handoffs/2026-04-13/20-55-01--s1--2.md",
    );
  });

  it("compares date directories before time", () => {
    const paths = [
      "handoffs/2026-04-12/23-59-59--s1.md",
      "handoffs/2026-04-13/00-00-01--s1.md",
    ];
    expect(latestHandoffPath(paths, "s1")).toBe(
      "handoffs/2026-04-13/00-00-01--s1.md",
    );
  });

  it("ignores non-matching files", () => {
    const paths = ["README.md", "handoffs/2026-04-13/09-00-00--other.md"];
    expect(latestHandoffPath(paths, "s1")).toBeUndefined();
  });
});

describe("parseDecompressionState", () => {
  it("parses a valid state", () => {
    expect(
      parseDecompressionState({ enabled: true, thresholdPercent: 60 }),
    ).toEqual({
      enabled: true,
      thresholdPercent: 60,
    });
    expect(
      parseDecompressionState({ enabled: false, thresholdPercent: null }),
    ).toEqual({
      enabled: false,
      thresholdPercent: null,
    });
  });

  it("rejects non-objects, missing fields, and bad types", () => {
    expect(parseDecompressionState(null)).toBeUndefined();
    expect(parseDecompressionState("on")).toBeUndefined();
    expect(parseDecompressionState({})).toBeUndefined();
    expect(
      parseDecompressionState({ enabled: "yes", thresholdPercent: 60 }),
    ).toBeUndefined();
    expect(parseDecompressionState({ enabled: true })).toBeUndefined();
  });

  it("rejects out-of-range thresholds", () => {
    expect(
      parseDecompressionState({ enabled: true, thresholdPercent: 0 }),
    ).toBeUndefined();
    expect(
      parseDecompressionState({ enabled: true, thresholdPercent: 101 }),
    ).toBeUndefined();
    expect(
      parseDecompressionState({ enabled: true, thresholdPercent: 60.5 }),
    ).toBeUndefined();
    expect(
      parseDecompressionState({ enabled: true, thresholdPercent: "60" }),
    ).toBeUndefined();
  });
});

describe("buildHandoffDecompression", () => {
  it("keeps Pi's prepared boundary before a tool result", () => {
    const result = buildHandoffDecompression({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
      firstKeptEntryId: "assistant-call",
      tokensBefore: 90_000,
    });
    expect(result.firstKeptEntryId).toBe("assistant-call");
  });

  it("keeps the prepared boundary for an empty branch projection", () => {
    const result = buildHandoffDecompression({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
      firstKeptEntryId: "keep-1",
      tokensBefore: 90_000,
    });
    expect(result.firstKeptEntryId).toBe("keep-1");
  });

  it("points the summary at the handoff file and persists the path in details", () => {
    const result = buildHandoffDecompression({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
      firstKeptEntryId: "keep-1",
      tokensBefore: 90_000,
    });
    expect(result.summary).toContain("/proj/.tmp/handoffs/handoff-s1.md");
    expect(result.tokensBefore).toBe(90_000);
    expect(result.details).toEqual({
      handoffPath: "/proj/.tmp/handoffs/handoff-s1.md",
    });
  });
});
