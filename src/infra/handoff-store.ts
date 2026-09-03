import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface HandoffFs {
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, content: string, encoding: "utf8"): Promise<void>;
}

export function handoffPath(dir: string, sessionId: string): string {
  return join(dir, `handoff-${sessionId}.md`);
}

export interface HandoffStore {
  write(dir: string, sessionId: string, content: string): Promise<string>;
  read(dir: string, sessionId: string): Promise<string | undefined>;
}

export function createHandoffStore(fs: HandoffFs = defaultHandoffFs()): HandoffStore {
  return {
    async write(dir, sessionId, content) {
      await fs.mkdir(dir, { recursive: true });
      const path = handoffPath(dir, sessionId);
      await fs.writeFile(path, content, "utf8");
      return path;
    },
    async read(dir, sessionId) {
      try {
        return await fs.readFile(handoffPath(dir, sessionId), "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

function defaultHandoffFs(): HandoffFs {
  return { mkdir, readFile, writeFile };
}
