import { spawnSync } from "node:child_process";

type Step = { name: string; args: string[] };

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps: Step[] = [
  { name: "typecheck", args: ["run", "typecheck"] },
  { name: "lint", args: ["run", "lint"] },
  {
    name: "seo-contracts",
    args: [
      "test",
      "--",
      "tests/seo-indexation.test.ts",
      "tests/seo-route-policy.test.ts",
      "tests/seo-private-resources.test.ts",
      "tests/seo-public-links.test.ts",
      "tests/seo-public-performance.test.ts",
      "tests/seo-metadata-safety.test.ts",
      "tests/build-preview-guard.test.ts",
    ],
  },
];

const results: Array<{ name: string; ok: boolean }> = [];

for (const step of steps) {
  console.log(`\n== SEO gate: ${step.name} ==`);
  const result = spawnSync(npm, step.args, {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "",
      ALLOW_DEMO_SEED: "false",
    },
  });
  const ok = result.status === 0;
  results.push({ name: step.name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${step.name}`);
}

console.log("\n== SEO static gate summary ==");
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
}

if (results.every((result) => result.ok)) {
  console.log("SEO_STATIC_GATE_PASS");
} else {
  console.error("SEO_STATIC_GATE_FAIL");
  process.exit(1);
}
