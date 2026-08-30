import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
});

if (result.status !== 0) {
  console.log("false");
  console.log(
    (result.stderr || result.stdout).trim().split("\n").slice(-40).join("\n"),
  );
  process.exit(1);
}

const [pack] = JSON.parse(result.stdout);
const files = pack.files.map(({ path }) => path);
const hasEntry = files.includes("src/index.ts");
const shipsTests = files.some((path) => path.endsWith(".test.ts"));

if (hasEntry && !shipsTests) {
  console.log("true");
  process.exit(0);
}

console.log("false");
if (!hasEntry) console.log("Package is missing src/index.ts");
if (shipsTests) console.log("Package includes test files");
process.exit(1);
