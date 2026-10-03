import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "src/**/*.ts", "src/**/*.tsx"], { encoding: "utf8" })
  .trim().split(/\s+/).filter(Boolean);

const rules: Array<{ name: string; pattern: RegExp }> = [
  { name: "dangerouslySetInnerHTML", pattern: /\bdangerouslySetInnerHTML\b/ },
  { name: "eval()", pattern: /\beval\s*\(/ },
  { name: "new Function()", pattern: /\bnew\s+Function\s*\(/ },
];

const failures: string[] = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const rule of rules) {
    if (rule.pattern.test(source)) failures.push(`${file}: ${rule.name}`);
  }
}
if (failures.length) {
  console.error("Dangerous source construct gate failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS dangerous source construct gate: ${files.length} source files checked.`);
