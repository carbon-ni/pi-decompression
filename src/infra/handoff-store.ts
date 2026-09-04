import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildHandoffRelativePath,
  latestHandoffPath,
} from "../domain/decompression-policy.js";

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface HandoffFs {
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, content: string, encoding: "utf8"): Promise<void>;
  readdir(path: string): Promise<DirEntry[]>;
}

export interface HandoffStore {
  /** Write an immutable handoff for the session stamped at `now`; returns the full path. */
  write(
    dir: string,
    sessionId: string,
    content: string,
    now: Date,
  ): Promise<string>;
  /** Read the newest handoff written for the session, if any. */
  readLatest(dir: string, sessionId: string): Promise<string | undefined>;
}

export function createHandoffStore(
  fs: HandoffFs = defaultHandoffFs(),
): HandoffStore {
  return {
    async write(dir, sessionId, content, now) {
      const relative = await availablePath(
        dir,
        buildHandoffRelativePath(now, sessionId),
        fs,
      );
      const path = join(dir, relative);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content, "utf8");
      return path;
    },
    async readLatest(dir, sessionId) {
      const relative = await findLatestRelative(dir, sessionId, fs);
      if (!relative) return undefined;
      try {
        return await fs.readFile(join(dir, relative), "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

/** Dear-diary rule: never overwrite; add the smallest free numeric suffix. */
async function availablePath(
  dir: string,
  relative: string,
  fs: HandoffFs,
): Promise<string> {
  let candidate = relative;
  for (let suffix = 2; suffix < 100; suffix++) {
    try {
      await fs.readFile(join(dir, candidate), "utf8");
    } catch {
      return candidate;
    }
    candidate = relative.replace(/\.md$/, `--${suffix}.md`);
  }
  throw new Error(`no free handoff filename for ${relative}`);
}

async function findLatestRelative(
  dir: string,
  sessionId: string,
  fs: HandoffFs,
): Promise<string | undefined> {
  const handoffsDir = join(dir, "handoffs");
  let dateDirs: DirEntry[];
  try {
    dateDirs = await fs.readdir(handoffsDir);
  } catch {
    return undefined;
  }
  const relatives: string[] = [];
  for (const dateDir of dateDirs) {
    if (!dateDir.isDirectory) continue;
    try {
      const files = await fs.readdir(join(handoffsDir, dateDir.name));
      for (const file of files) {
        if (!file.isDirectory)
          relatives.push(`handoffs/${dateDir.name}/${file.name}`);
      }
    } catch {
      /* unreadable date dir: skip */
    }
  }
  return latestHandoffPath(relatives, sessionId);
}

function defaultHandoffFs(): HandoffFs {
  return {
    mkdir,
    readFile,
    writeFile,
    async readdir(path) {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    },
  };
}
