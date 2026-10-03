import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const files = execFileSync("git", ["ls-files", "src/**/*.ts", "src/**/*.tsx"], { encoding: "utf8" })
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const failures: string[] = [];

function report(file: string, sourceFile: ts.SourceFile, node: ts.Node, kind: string) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  failures.push(`${file}:${pos.line + 1}:${pos.character + 1}: ${kind}`);
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "dangerouslySetInnerHTML") {
      report(file, sourceFile, node, "dangerouslySetInnerHTML");
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval") {
      report(file, sourceFile, node, "eval()");
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
      report(file, sourceFile, node, "new Function()");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (failures.length) {
  console.error("Dangerous source construct gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS dangerous source construct gate: ${files.length} source files checked with TypeScript AST.`);
