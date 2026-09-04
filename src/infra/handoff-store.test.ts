import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHandoffStore, type HandoffFs } from "./handoff-store.js";

function fakeFs(): HandoffFs & {
  files: Map<string, string>;
  dirs: Set<string>;
} {
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
          .filter(
            (d) =>
              d.startsWith(prefix) && !d.slice(prefix.length).includes("/"),
          )
          .map((name) => ({
            name: name.slice(prefix.length),
            isDirectory: true,
          })),
        ...[...files.keys()]
          .filter(
            (f) =>
              f.startsWith(prefix) && !f.slice(prefix.length).includes("/"),
          )
          .map((name) => ({
            name: name.slice(prefix.length),
            isDirectory: false,
          })),
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

  it("returns undefined when the newest handoff cannot be read", async () => {
    const fs = fakeFs();
    const store = createHandoffStore(fs);
    const path = await store.write(DIR, "s1", "content", NOW);
    fs.readFile = async (candidate) => {
      if (candidate === path) throw new Error("permission denied");
      return "content";
    };

    await expect(store.readLatest(DIR, "s1")).resolves.toBeUndefined();
  });

  it("skips an unreadable date directory", async () => {
    const fs = fakeFs();
    fs.dirs.add(`${DIR}/handoffs/2026-04-13`);
    const list = fs.readdir;
    fs.readdir = async (path) => {
      if (path === `${DIR}/handoffs/2026-04-13`)
        throw new Error("permission denied");
      return list(path);
    };

    await expect(
      createHandoffStore(fs).readLatest(DIR, "s1"),
    ).resolves.toBeUndefined();
  });

  it("ignores files where date directories or handoff entries are expected", async () => {
    const fs = fakeFs();
    fs.files.set(`${DIR}/handoffs/not-a-date`, "file");
    fs.dirs.add(`${DIR}/handoffs/2026-04-13`);
    fs.dirs.add(`${DIR}/handoffs/2026-04-13/entry-dir`);

    await expect(
      createHandoffStore(fs).readLatest(DIR, "s1"),
    ).resolves.toBeUndefined();
  });

  it("fails rather than overwriting when all suffixes are occupied", async () => {
    const fs = fakeFs();
    fs.readFile = async () => "occupied";

    await expect(
      createHandoffStore(fs).write(DIR, "s1", "content", NOW),
    ).rejects.toThrow("no free handoff filename");
  });

  it("uses the default filesystem adapter", async () => {
    await expect(
      createHandoffStore().readLatest("/tmp/pi-decompression-missing", "s1"),
    ).resolves.toBeUndefined();
    const dir = await mkdtemp(join(tmpdir(), "pi-decompression-"));
    try {
      const store = createHandoffStore();
      await store.write(dir, "s1", "content", NOW);
      await expect(store.readLatest(dir, "s1")).resolves.toBe("content");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when no handoff exists", async () => {
    const store = createHandoffStore(fakeFs());
    await expect(store.readLatest(DIR, "missing")).resolves.toBeUndefined();
  });
});
