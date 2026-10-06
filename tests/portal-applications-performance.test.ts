import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("portal applications performance contract", () => {
  const page = readFileSync("src/app/portal/applications/page.tsx", "utf8");
  const applications = readFileSync("src/lib/applications.ts", "utf8");

  it("loads checklist progress in one batch for the visible application rows", () => {
    expect(page).toContain("checklistProgressForApplications(result.rows.map");
    expect(page).not.toContain("await Promise.all(\n    result.rows.map(async (r) =>");
  });

  it("groups checklist progress by application instead of issuing one query per application", () => {
    expect(applications).toContain("export async function checklistProgressForApplications");
    expect(applications).toContain(".where(inArray(checklistItems.applicationId, ids))");
    expect(applications).toContain(".groupBy(checklistItems.applicationId)");
  });
});
