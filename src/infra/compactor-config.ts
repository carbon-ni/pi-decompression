import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseCompactorState, type CompactorState } from "../domain/compactor-policy.js";

export interface ConfigFs {
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, content: string, encoding: "utf8"): Promise<void>;
}

export function compactorConfigPath(cwd: string): string {
  return join(cwd, ".pi", "compactor.json");
}

export interface CompactorConfigStore {
  read(cwd: string): Promise<CompactorState | undefined>;
  write(cwd: string, state: CompactorState): Promise<void>;
}

export function createCompactorConfig(fs: ConfigFs = defaultConfigFs()): CompactorConfigStore {
  return {
    async read(cwd) {
      try {
        const content = await fs.readFile(compactorConfigPath(cwd), "utf8");
        return parseCompactorState(JSON.parse(content));
      } catch {
        return undefined;
      }
    },
    async write(cwd, state) {
      const path = compactorConfigPath(cwd);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    },
  };
}

function defaultConfigFs(): ConfigFs {
  return { mkdir, readFile, writeFile };
}
