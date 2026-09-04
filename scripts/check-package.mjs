import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
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
const requiredFiles = [
  "README.md",
  "package.json",
  "src/index.ts",
  "src/domain/decompression-policy.ts",
  "src/infra/decompression-config.ts",
  "src/infra/decompression.ts",
  "src/infra/handoff-store.ts",
];
const missingFiles = requiredFiles.filter((path) => !files.includes(path));
const forbiddenFiles = files.filter(
  (path) =>
    path.endsWith(".test.ts") ||
    path.split("/").includes(".pi") ||
    /(^|\/)(?:dist|coverage|node_modules)(?:\/|$)/.test(path) ||
    /(?:^|\/)(?:\.env(?:\.|$)|.*\.(?:log|pem|key))$/.test(path),
);
const metadataErrors = [];
if (pack.id !== `${packageJson.name}@${packageJson.version}`) {
  metadataErrors.push("package name/version does not match npm pack identity");
}
if (!packageJson.pi?.extensions?.includes("./src/index.ts")) {
  metadataErrors.push("pi.extensions must include ./src/index.ts");
}
if (!packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"]) {
  metadataErrors.push(
    "peerDependencies must include @earendil-works/pi-coding-agent",
  );
}
if (packageJson.private !== true) {
  if (!packageJson.license)
    metadataErrors.push("public packages require license metadata");
  if (!packageJson.repository) {
    metadataErrors.push("public packages require repository metadata");
  }
}

if (
  missingFiles.length === 0 &&
  forbiddenFiles.length === 0 &&
  metadataErrors.length === 0
) {
  console.log("true");
  process.exit(0);
}

console.log("false");
for (const path of missingFiles) console.log(`Package is missing ${path}`);
if (forbiddenFiles.length > 0) {
  console.log("Package includes forbidden files:");
  for (const path of forbiddenFiles) console.log(`- ${path}`);
}
for (const error of metadataErrors) console.log(error);
process.exit(1);
