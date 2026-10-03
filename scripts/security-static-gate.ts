import { execFileSync } from "node:child_process";
import { basename, extname } from "node:path";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenNames = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.preview",
  ".env.development",
  "id_rsa",
  "id_ed25519",
]);

const forbiddenExtensions = new Set([".pem", ".p12", ".pfx", ".key"]);
const binaryExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".ttf", ".woff", ".woff2",
  ".pdf", ".zip", ".gz", ".mp4",
]);

const failures: string[] = [];
for (const file of tracked) {
  const name = basename(file);
  const ext = extname(file).toLowerCase();
  if (forbiddenNames.has(name) || forbiddenExtensions.has(ext)) {
    failures.push(`${file}: sensitive credential file must not be tracked`);
  }
}

const patterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "known live token prefix",
    pattern: /\b(?:ghp|github_pat|sk_live|sb_secret)_[A-Za-z0-9_=-]{16,}\b/,
  },
  {
    name: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "Supabase service-role assignment",
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?(?!<|example|changeme|replace-me)([^"'\s#]{20,})/i,
  },
  {
    name: "non-local PostgreSQL URL assignment",
    pattern: /\bDATABASE_URL\s*=\s*["']?postgres(?:ql)?:\/\/(?!(?:[^@"'\s]+@)?(?:localhost|127\.0\.0\.1)(?::|\/))([^"'\s#]+)/i,
  },
  {
    name: "publicly exposed secret variable",
    pattern: /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE|SERVICE_ROLE)[A-Z0-9_]*\s*=/,
  },
];

for (const file of tracked) {
  if (file === "scripts/security-static-gate.ts" || binaryExtensions.has(extname(file).toLowerCase())) continue;
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const check of patterns) {
    if (check.pattern.test(content)) failures.push(`${file}: ${check.name}`);
  }
}

if (failures.length) {
  console.error("Security static gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS security static gate: ${tracked.length} tracked files checked; no credential artifacts or obvious live secrets found.`);
