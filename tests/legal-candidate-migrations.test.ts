import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";

describe("unapproved legal and retention migrations", () => {
  it("keeps candidate DDL out of automatic migration discovery and the qualified 0033 ledger", () => {
    const root = readdirSync(path.join(process.cwd(), "migrations")).filter(name => name.endsWith(".sql"));
    expect(root).not.toContain("0034_document_retention.sql");
    expect(root).not.toContain("0035_legal_document_kinds.sql");
    expect(root.sort().at(-1)).toBe("0033_rule_provenance_and_bounded_history.sql");
    expect(readdirSync(path.join(process.cwd(), "migrations/candidates")).filter(name => name.endsWith(".sql")).sort()).toEqual(["0034_document_retention.sql", "0035_legal_document_kinds.sql"]);
  });
});
