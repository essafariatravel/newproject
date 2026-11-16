/** Compile the actual CLI source for child-process tests. Windows sandboxed
 * tsx can fail in os.userInfo before any application code runs. Transpiling with
 * the same locked esbuild compiler keeps every real CLI guard executable. */
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const runtimeRequire = createRequire(import.meta.url);
const tsxRequire = createRequire(runtimeRequire.resolve("tsx"));
const compile = runtimeRequire(tsxRequire.resolve("esbuild")).transformSync as (source: string, options: {
  loader: string; format: string; target: string;
}) => { code: string };
const directory = mkdtempSync(path.join(os.tmpdir(), "essafaria-reset-cli-"));
const seen = new Set<string>();
function emit(relative: string) {
  if (seen.has(relative)) return;
  seen.add(relative);
  const output = compile(readFileSync(path.resolve(relative), "utf8"), { loader: "ts", format: "cjs", target: "node24" }).code;
  const destination = path.join(directory, relative.replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, output);
  for (const match of output.matchAll(/require\("(\.[^"]+)"\)/g)) emit(path.normalize(path.join(path.dirname(relative), `${match[1]}.ts`)));
}
emit("scripts/reset.ts");
export const resetCliPath = path.join(directory, "scripts", "reset.js");
export const resetCliNodePath = path.resolve("node_modules");
