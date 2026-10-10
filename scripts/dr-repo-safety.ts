/**
 * Public-repository DR safety gate.
 *
 * Git ignore rules prevent new accidental additions in normal workflows, but
 * they do not protect files that were force-added or already tracked. This
 * script inspects the Git index and fails if a private recovery artifact or
 * environment file is tracked.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function trackedPrivateArtifactProblem(file: string): string | null {
  const normalized = file.replaceAll("\\", "/");
  const base = path.posix.basename(normalized);
  const lower = base.toLowerCase();

  if (base === ".env.example") return null;
  if (base === ".env" || base.startsWith(".env.")) return "tracked environment file";
  if (base === ".pgpass") return "tracked PostgreSQL password file";
  if (lower.endsWith(".dr-key")) return "tracked disaster-recovery encryption key";

  if (lower.endsWith(".dump") || lower.endsWith(".dump.enc") || lower.endsWith(".backup")) {
    return "tracked database backup artifact";
  }
  if (
    lower.endsWith(".restore-evidence.json") ||
    lower.endsWith(".offsite-evidence.json") ||
    lower.endsWith(".application-evidence.json") ||
    lower.endsWith(".tenant-evidence.json") ||
    lower.endsWith(".verified.manifest.json")
  ) {
    return "tracked private disaster-recovery evidence";
  }
  if (/^essafaria-(prod|synthetic)-.*\.manifest\.json$/i.test(base)) {
    return "tracked private disaster-recovery manifest";
  }
  return null;
}

function main() {
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Could not inspect tracked repository files.");
  const files = result.stdout.split("\0").filter(Boolean);
  const findings = files.flatMap((file) => {
    const problem = trackedPrivateArtifactProblem(file);
    return problem ? [{ file, problem }] : [];
  });

  console.log(JSON.stringify({
    status: findings.length ? "FAIL" : "PASS",
    trackedFilesChecked: files.length,
    findings,
  }, null, 2));
  if (findings.length) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
