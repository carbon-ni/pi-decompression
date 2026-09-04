import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  parseDecompressionState,
  type DecompressionState,
} from "../domain/decompression-policy.js";

export interface ConfigFs {
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, content: string, encoding: "utf8"): Promise<void>;
}

export function decompressionConfigPath(cwd: string): string {
  return join(cwd, ".pi", "decompression.json");
}

export interface DecompressionConfigStore {
  read(cwd: string): Promise<DecompressionState | undefined>;
  write(cwd: string, state: DecompressionState): Promise<void>;
}

export function createDecompressionConfig(
  fs: ConfigFs = defaultConfigFs(),
): DecompressionConfigStore {
  return {
    async read(cwd) {
      try {
        const content = await fs.readFile(decompressionConfigPath(cwd), "utf8");
        return parseDecompressionState(JSON.parse(content));
      } catch {
        return undefined;
      }
    },
    async write(cwd, state) {
      const path = decompressionConfigPath(cwd);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    },
  };
}

function defaultConfigFs(): ConfigFs {
  return { mkdir, readFile, writeFile };
}
