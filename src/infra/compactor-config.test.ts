import { describe, expect, it } from "vitest";
import { createCompactorConfig, compactorConfigPath, type ConfigFs } from "./compactor-config.js";

function fakeFs(): ConfigFs & { files: Map<string, string>; dirs: Set<string> } {
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
  };
}

const CWD = "/proj";
const CONFIG_FILE = "/proj/.pi/compactor.json";

describe("compactorConfigPath", () => {
  it("lives at <cwd>/.pi/compactor.json", () => {
    expect(compactorConfigPath(CWD)).toBe(CONFIG_FILE);
  });
});

describe("createCompactorConfig", () => {
  it("writes state as JSON, creating .pi when needed", async () => {
    const fs = fakeFs();
    const config = createCompactorConfig(fs);
    await config.write(CWD, { enabled: true, thresholdPercent: 60 });
    expect(fs.dirs.has("/proj/.pi")).toBe(true);
    expect(JSON.parse(fs.files.get(CONFIG_FILE) ?? "")).toEqual({
      enabled: true,
      thresholdPercent: 60,
    });
  });

  it("reads back written state", async () => {
    const fs = fakeFs();
    const config = createCompactorConfig(fs);
    await config.write(CWD, { enabled: true, thresholdPercent: 60 });
    await expect(config.read(CWD)).resolves.toEqual({ enabled: true, thresholdPercent: 60 });
  });

  it("returns undefined when the file is missing", async () => {
    const config = createCompactorConfig(fakeFs());
    await expect(config.read(CWD)).resolves.toBeUndefined();
  });

  it("returns undefined on malformed JSON", async () => {
    const fs = fakeFs();
    fs.files.set(CONFIG_FILE, "{broken");
    const config = createCompactorConfig(fs);
    await expect(config.read(CWD)).resolves.toBeUndefined();
  });

  it("returns undefined when the shape is invalid", async () => {
    const fs = fakeFs();
    fs.files.set(CONFIG_FILE, JSON.stringify({ enabled: true, thresholdPercent: 101 }));
    const config = createCompactorConfig(fs);
    await expect(config.read(CWD)).resolves.toBeUndefined();
  });
});
