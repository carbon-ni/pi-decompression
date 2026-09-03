import { describe, expect, it } from "vitest";
import { createHandoffStore, type HandoffFs } from "./handoff-store.js";

function fakeFs(): HandoffFs & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async mkdir(path) {
      dirs.add(path);
    },
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async readdir(path) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [
        ...[...dirs]
          .filter((d) => d.startsWith(prefix) && !d.slice(prefix.length).includes("/"))
          .map((name) => ({ name: name.slice(prefix.length), isDirectory: true })),
        ...[...files.keys()]
          .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
          .map((name) => ({ name: name.slice(prefix.length), isDirectory: false })),
      ];
    },
  };
}

const DIR = "/proj/.tmp/reports";
const NOW = new Date(2026, 3, 13, 20, 55, 1);
const REL = "handoffs/2026-04-13/20-55-01--s1.md";

describe("createHandoffStore", () => {
  it("writes to handoffs/<date>/<time>--<session>.md and returns the path", async () => {
    const fs = fakeFs();
    const store = createHandoffStore(fs);
    const path = await store.write(DIR, "s1", "# Handoff", NOW);
    expect(path).toBe(`${DIR}/${REL}`);
    expect(fs.files.get(path)).toBe("# Handoff");
  });

  it("never overwrites: adds a numeric suffix when the stamp collides", async () => {
    const fs = fakeFs();
    const store = createHandoffStore(fs);
    const first = await store.write(DIR, "s1", "first", NOW);
    const second = await store.write(DIR, "s1", "second", NOW);
    expect(first).toBe(`${DIR}/${REL}`);
    expect(second).toBe(`${DIR}/handoffs/2026-04-13/20-55-01--s1--2.md`);
    expect(fs.files.get(first)).toBe("first");
  });

  it("reads back the latest handoff for the session", async () => {
    const fs = fakeFs();
    const store = createHandoffStore(fs);
    await store.write(DIR, "s1", "older", new Date(2026, 3, 13, 9, 0, 0));
    await store.write(DIR, "s1", "newer", NOW);
    await store.write(DIR, "other", "unrelated", NOW);
    await expect(store.readLatest(DIR, "s1")).resolves.toBe("newer");
  });

  it("returns undefined when no handoff exists", async () => {
    const store = createHandoffStore(fakeFs());
    await expect(store.readLatest(DIR, "missing")).resolves.toBeUndefined();
  });
});
