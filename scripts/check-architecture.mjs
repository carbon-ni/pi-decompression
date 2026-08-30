import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const guardedDirectories = ["src/domain", "src/lib"];
const externalImport = /(?:from\s+|import\s*)["']([^./][^"']*)["']/g;
const violations = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    if (extname(path) !== ".ts" || path.endsWith(".test.ts")) continue;

    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(externalImport)) {
      violations.push(`${path}: external import ${match[1]}`);
    }
  }
}

for (const directory of guardedDirectories) await inspect(directory);

if (violations.length === 0) {
  console.log("true");
  process.exit(0);
}

console.log("false");
console.log(violations.slice(0, 40).join("\n"));
process.exit(1);
