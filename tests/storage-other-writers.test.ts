import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// Integration coverage for storage-reference publishers that do not share one
// transaction adapter. Runtime state/rollback semantics live in storage tests.
function source(file: string) {
  return ts.createSourceFile(file, readFileSync(`src/lib/${file}`, "utf8"), ts.ScriptTarget.Latest, true);
}
function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node) => { found.push(child); child.forEachChild(visit); };
  visit(node);
  return found;
}
function namedFunction(file: string, name: string): ts.FunctionDeclaration {
  const declaration = descendants(source(file)).find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing writer ${name}`);
  return declaration;
}
function calls(node: ts.Node, name: string): ts.CallExpression[] {
  return descendants(node).filter((child): child is ts.CallExpression =>
    ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === name);
}
function transactionAncestor(node: ts.Node): ts.CallExpression | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) &&
        parent.expression.name.text === "transaction") return parent;
  }
}
function commitCalls(node: ts.Node): ts.CallExpression[] {
  return descendants(node).filter((child): child is ts.CallExpression =>
    ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) &&
    child.expression.name.text === "query" && !!child.arguments[0] &&
    ts.isStringLiteral(child.arguments[0]) && child.arguments[0].text.toLowerCase() === "commit");
}

describe("storage reference publication coverage for auxiliary writers", () => {
  it("adopts every initial registration file in the metadata transaction", () => {
    const fn = namedFunction("registrations.ts", "persistRegistration");
    const adopt = calls(fn, "storageReferenceCommitted")[0]!;
    expect(adopt, "registration metadata must adopt its uploaded keys").toBeDefined();
    expect(transactionAncestor(adopt)).toBeDefined();
    expect(adopt.arguments[0]!.getText()).toBe("tx");
    expect(adopt.arguments[1]!.getText()).toMatch(/stored\.map/);
    const lastReturn = descendants(transactionAncestor(adopt)!).filter(ts.isReturnStatement).at(-1)!;
    expect(adopt.end).toBeLessThan(lastReturn.pos);
  });

  it("adopts follow-up evidence before its native metadata commit", () => {
    const fn = namedFunction("registration-followup.ts", "uploadRegistrationFollowup");
    const adopt = calls(fn, "storageReferenceCommitted")[0]!;
    expect(adopt, "follow-up metadata must adopt its uploaded key").toBeDefined();
    expect(adopt.arguments.map(arg => arg.getText())).toEqual(["client", "storageKey"]);
    expect(adopt.end).toBeLessThan(commitCalls(fn).at(-1)!.pos);
  });

  it("adopts the complete submitted request batch before the non-reused commit", () => {
    const fn = namedFunction("requests.ts", "submitVisaRequest");
    const adopt = calls(fn, "storageReferenceCommitted")[0]!;
    expect(adopt, "new request metadata must adopt every uploaded key").toBeDefined();
    expect(adopt.arguments.map(arg => arg.getText())).toEqual(["client", "writtenKeys"]);
    const commits = commitCalls(fn);
    expect(adopt.pos).toBeGreaterThan(commits[0]!.end);
    expect(adopt.end).toBeLessThan(commits.at(-1)!.pos);
  });

  it("adopts a new top-up receipt inside its transaction", () => {
    const fn = namedFunction("topup.ts", "createTopupRequest");
    const adopt = calls(fn, "storageReferenceCommitted")[0]!;
    expect(adopt, "top-up metadata must adopt its uploaded receipt").toBeDefined();
    expect(transactionAncestor(adopt)).toBeDefined();
    expect(adopt.arguments.map(arg => arg.getText())).toEqual(["tx", "key"]);
    const lastReturn = descendants(transactionAncestor(adopt)!).filter(ts.isReturnStatement).at(-1)!;
    expect(adopt.end).toBeLessThan(lastReturn.pos);
  });

  it("adopts a replacement logo before queuing the old external key in the same transaction", () => {
    const fn = namedFunction("branding.ts", "putLogo");
    const adopt = calls(fn, "storageReferenceCommitted")[0]!;
    const queue = calls(fn, "storageDeletionQueued")[0]!;
    expect(adopt, "external logo metadata must adopt its uploaded key").toBeDefined();
    expect(queue, "replacement must durably queue its detached key").toBeDefined();
    expect(transactionAncestor(adopt)).toBe(transactionAncestor(queue));
    expect(transactionAncestor(adopt)).toBeDefined();
    expect(adopt.end).toBeLessThan(queue.pos);
    expect(adopt.arguments.map(arg => arg.getText())).toEqual(["tx", "key"]);
    expect(queue.arguments[0]!.getText()).toBe("tx");
  });

  it.each(["clearBrandLogo", "clearAgencyLogo"])("%s queues detached external artwork before its transaction ends", name => {
    const fn = namedFunction("branding.ts", name);
    const queue = calls(fn, "storageDeletionQueued")[0]!;
    expect(queue, "logo removal must durably queue its detached key").toBeDefined();
    expect(transactionAncestor(queue)).toBeDefined();
    expect(queue.arguments.map(arg => arg.getText())).toEqual(["tx", "previous"]);
  });
});
