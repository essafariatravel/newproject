import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Third-party GitHub Actions must be pinned to immutable commit SHAs.
 * Local actions (./...) are allowed.
 */
const files = execFileSync("git", ["ls-files", ".github/workflows/*.yml", ".github/workflows/*.yaml"], { encoding: "utf8" })
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const failures: string[] = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const match = line.match(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/);
    if (!match) return;
    const value = match[1]!;
    if (value.startsWith("./")) return;
    const at = value.lastIndexOf("@");
    const ref = at >= 0 ? value.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      failures.push(`${file}:${index + 1}: ${value}`);
    }
  });
}

if (failures.length) {
  console.error("Unpinned third-party GitHub Actions:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS GitHub Actions pinning gate: ${files.length} workflow files checked.`);
