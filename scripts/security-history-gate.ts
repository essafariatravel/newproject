import { execFileSync, spawnSync } from "node:child_process";

const revisions = execFileSync("git", ["rev-list", "--all"], { encoding: "utf8" })
  .trim()
  .split(/\s+/)
  .filter(Boolean);

// Deliberately high-confidence signatures only: this historical scan must not
// be weakened by false positives from documentation/examples.
const pattern = [
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
  "ghp_[A-Za-z0-9]{20,}",
  "github_pat_[A-Za-z0-9_]{20,}",
  "sk_live_[A-Za-z0-9]{16,}",
  "sb_secret_[A-Za-z0-9_=-]{16,}",
  "AKIA[0-9A-Z]{16}",
].join("|");

const findings = new Set<string>();
for (const revision of revisions) {
  const result = spawnSync(
    "git",
    [
      "grep",
      "-I",
      "-n",
      "-E",
      "-e",
      pattern,
      revision,
      "--",
      ".",
      ":(exclude)scripts/security-history-gate.ts",
    ],
    { encoding: "utf8" },
  );
  if (result.status === 0 && result.stdout) {
    for (const line of result.stdout.split("\n").filter(Boolean)) findings.add(line);
  } else if (result.status !== 1) {
    console.error(result.stderr || `git grep failed for ${revision}`);
    process.exit(2);
  }
}

if (findings.size) {
  console.error("Historical secret gate failed. Rotate any live credential before removing it from history.");
  for (const finding of [...findings].slice(0, 100)) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`PASS historical secret gate: ${revisions.length} revisions scanned; no high-confidence credential material found.`);
