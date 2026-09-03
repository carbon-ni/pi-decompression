import { describe, expect, it } from "vitest";
import { createHandoffStore, handoffPath, type HandoffFs } from "./handoff-store.js";

function fakeFs(): HandoffFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {},
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
  };
}

describe("handoffPath", () => {
  it("builds a deterministic per-session file name", () => {
    expect(handoffPath("/proj/.tmp/handoffs", "s1")).toBe("/proj/.tmp/handoffs/handoff-s1.md");
  });
});

describe("createHandoffStore", () => {
  it("writes content and returns the file path", async () => {
    const fs = fakeFs();
    const store = createHandoffStore(fs);
    const path = await store.write("/h", "s1", "# Handoff");
    expect(path).toBe(handoffPath("/h", "s1"));
    expect(fs.files.get(path)).toBe("# Handoff");
  });

  it("reads back written content", async () => {
    const fs = fakeFs();
    const store = createHandoffStore(fs);
    await store.write("/h", "s1", "# Handoff");
    await expect(store.read("/h", "s1")).resolves.toBe("# Handoff");
  });

  it("returns undefined when no handoff exists", async () => {
    const store = createHandoffStore(fakeFs());
    await expect(store.read("/h", "missing")).resolves.toBeUndefined();
  });
});
