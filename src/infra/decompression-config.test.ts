import { describe, expect, it } from "vitest";
import {
  createDecompressionConfig,
  decompressionConfigPath,
  type ConfigFs,
} from "./decompression-config.js";

function fakeFs(): ConfigFs & {
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
  };
}

const CWD = "/proj";
const CONFIG_FILE = "/proj/.pi/decompression.json";

describe("decompressionConfigPath", () => {
  it("lives at <cwd>/.pi/decompression.json", () => {
    expect(decompressionConfigPath(CWD)).toBe(CONFIG_FILE);
  });
});

describe("createDecompressionConfig", () => {
  it("writes state as JSON, creating .pi when needed", async () => {
    const fs = fakeFs();
    const config = createDecompressionConfig(fs);
    await config.write(CWD, { enabled: true, thresholdPercent: 60 });
    expect(fs.dirs.has("/proj/.pi")).toBe(true);
    expect(JSON.parse(fs.files.get(CONFIG_FILE) ?? "")).toEqual({
      enabled: true,
      thresholdPercent: 60,
    });
  });

  it("reads back written state", async () => {
    const fs = fakeFs();
    const config = createDecompressionConfig(fs);
    await config.write(CWD, { enabled: true, thresholdPercent: 60 });
    await expect(config.read(CWD)).resolves.toEqual({
      enabled: true,
      thresholdPercent: 60,
    });
  });

  it("returns undefined when the file is missing", async () => {
    const config = createDecompressionConfig(fakeFs());
    await expect(config.read(CWD)).resolves.toBeUndefined();
  });

  it("returns undefined on malformed JSON", async () => {
    const fs = fakeFs();
    fs.files.set(CONFIG_FILE, "{broken");
    const config = createDecompressionConfig(fs);
    await expect(config.read(CWD)).resolves.toBeUndefined();
  });

  it("returns undefined when the shape is invalid", async () => {
    const fs = fakeFs();
    fs.files.set(
      CONFIG_FILE,
      JSON.stringify({ enabled: true, thresholdPercent: 101 }),
    );
    const config = createDecompressionConfig(fs);
    await expect(config.read(CWD)).resolves.toBeUndefined();
  });
});
