import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applicationElapsedMs,
  formatElapsed,
  waitingBand,
} from "@/lib/time-in-status";

const submittedAt = "2026-11-10T09:00:00.000Z";
const decisionAt = "2026-11-12T12:15:00.000Z";
const terminalSince = "2026-11-12T12:15:00.000Z";
const muchLater = new Date("2027-04-01T10:00:00.000Z");

describe("staff duration: live until closure, frozen afterwards", () => {
  it.each(["APPROVED", "REJECTED", "CANCELLED"])(
    "never keeps incrementing a terminal %s dossier",
    (status) => {
      const input = {
        isTerminal: true,
        statusSince: terminalSince,
        submittedAt,
        decisionAt: status === "CANCELLED" ? null : decisionAt,
      };
      const atClosing = applicationElapsedMs(input, new Date(decisionAt));
      const afterSeveralMonths = applicationElapsedMs(input, muchLater);
      expect(atClosing).toBe(2 * 86_400_000 + 3 * 3_600_000 + 15 * 60_000);
      expect(afterSeveralMonths).toBe(atClosing);
      expect(formatElapsed(atClosing!, "fr")).toBe("2 jours 3 h");
      expect(formatElapsed(atClosing!, "en")).toBe("2 days 3 h");
    },
  );

  it("prefers the official decision timestamp over a later terminal-status metadata timestamp", () => {
    expect(applicationElapsedMs({
      isTerminal: true,
      submittedAt,
      decisionAt,
      statusSince: "2026-11-16T00:00:00.000Z",
    }, muchLater)).toBe(2 * 86_400_000 + 3 * 3_600_000 + 15 * 60_000);
  });

  it("can fall back to completedAt for historical final dossiers", () => {
    expect(applicationElapsedMs({
      isTerminal: true,
      submittedAt,
      statusSince: null,
      completedAt: decisionAt,
    }, muchLater)).toBe(2 * 86_400_000 + 3 * 3_600_000 + 15 * 60_000);
  });

  it("keeps unclosed dossiers live based on time in their current status", () => {
    const input = {
      isTerminal: false,
      statusSince: "2026-11-18T09:00:00.000Z",
      submittedAt,
    };
    expect(applicationElapsedMs(input, new Date("2026-11-18T11:00:00Z"))).toBe(2 * 3_600_000);
    expect(applicationElapsedMs(input, new Date("2026-11-18T12:00:00Z"))).toBe(3 * 3_600_000);
    expect(waitingBand(8)).toBe("aging");
  });

  it("never invents a completed duration without valid timestamps", () => {
    const base = { isTerminal: true, submittedAt, statusSince: null };
    expect(applicationElapsedMs(base)).toBeNull();
    expect(applicationElapsedMs({ ...base, submittedAt: null, decisionAt })).toBeNull();
    expect(applicationElapsedMs({ ...base, statusSince: "bad date" })).toBeNull();
    expect(applicationElapsedMs({ ...base, decisionAt: "2026-11-01T00:00:00Z" })).toBeNull();
  });

  it("keeps list, export and aging filter consistent with final timestamps", () => {
    const admin = readFileSync("src/app/admin/applications/page.tsx", "utf8");
    const exportRoute = readFileSync("src/app/api/admin/applications/export/route.ts", "utf8");
    const queries = readFileSync("src/lib/queries.ts", "utf8");
    expect(admin).toContain("applicationElapsedMs({");
    expect(admin).toContain("r.isTerminal");
    expect(admin).toContain('ct("Duration")');
    expect(admin).toContain('ct("Processing time")');
    expect(exportRoute).toContain("applicationElapsedMs({");
    expect(exportRoute).toContain('"Duration (days)"');
    expect(queries).toContain("isTerminal: statuses.isTerminal");
    expect(queries).toContain("conditions.push(eq(statuses.isTerminal, false))");
    expect(admin).not.toContain("elapsedLabel(new Date(r.statusSince), uiLocale)");
    expect(exportRoute).not.toContain("Date.now() - new Date(r.statusSince)");
  });
});
