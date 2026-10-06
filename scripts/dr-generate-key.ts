/**
 * Generate a 256-bit disaster-recovery encryption key into a private file.
 *
 * The key itself is never printed. The output must live outside the public
 * repository and is created with mode 0600 using exclusive creation.
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { privateArtifactPath } from "./lib/dr-private-path";

function parseArgs(args: string[]) {
  if (args.length !== 2 || args[0] !== "--output" || !args[1]) {
    throw new Error("Use --output ABSOLUTE_PRIVATE_PATH.dr-key");
  }
  if (!args[1].endsWith(".dr-key")) {
    throw new Error("Recovery key files must use the .dr-key suffix.");
  }
  return privateArtifactPath(args[1], "--output", { requireAbsolute: true });
}

async function main() {
  if (process.env.VERCEL || process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Recovery key generation is forbidden in deployed/Production runtime.");
  }
  const output = parseArgs(process.argv.slice(2));
  const key = randomBytes(32);
  const encoded = key.toString("base64");
  const fingerprint = createHash("sha256").update(key).digest("hex");
  try {
    await writeFile(output, encoded + "\n", {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    console.log(JSON.stringify({
      status: "CREATED",
      keyBytes: 32,
      keyFileSuffix: ".dr-key",
      keyFingerprintSha256: fingerprint,
      keyPrinted: false,
      instruction: "Keep this file separately from the encrypted backup and load its single line into DR_BACKUP_KEY_BASE64 only on the trusted operator machine.",
    }, null, 2));
  } finally {
    key.fill(0);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Recovery key generation failed safely.");
  process.exitCode = 1;
});
