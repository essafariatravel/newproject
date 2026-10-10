import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("observability operational artifacts", () => {
  it("keeps critical integrity and release-protection alerts routed", () => {
    const policy = json<{
      sev1: { immediate_events: string[] };
      sev2: { event_families: string[] };
    }>("docs/observability-alert-policy.json");

    expect(policy.sev1.immediate_events).toContain("integrity.violation");
    expect(policy.sev2.event_families).toEqual(
      expect.arrayContaining([
        "integrity.configuration.invalid",
        "release.protection_check.failed",
        "release.protections.missing",
        "action.technical_failed",
        "audit.persistence_failed",
        "auth.authenticate.*_failed",
        "auth.session.resolve_failed",
        "database.observability_snapshot.failed",
        "database.configuration.missing",
        "document.*.technical_failed",
        "document.persistence.failed",
        "integrity.check.failed",
        "next.request.unhandled_error",
      ]),
    );
  });

  it("keeps dashboard identifiers unique and privacy-safe", () => {
    const dashboard = json<{
      forbidden_dimensions: string[];
      panels: Array<{ id: string }>;
      monitors: Array<{ id: string; severity: string; condition: string }>;
    }>("docs/observability-dashboard-spec.json");

    expect(dashboard.forbidden_dimensions).toEqual(
      expect.arrayContaining([
        "email",
        "passport",
        "filename",
        "storage_key",
        "raw_agency_id",
        "raw_application_id",
        "request_body",
        "response_body",
      ]),
    );

    const panelIds = dashboard.panels.map((panel) => panel.id);
    const monitorIds = dashboard.monitors.map((monitor) => monitor.id);
    expect(new Set(panelIds).size).toBe(panelIds.length);
    expect(new Set(monitorIds).size).toBe(monitorIds.length);

    expect(
      dashboard.monitors.some(
        (monitor) =>
          monitor.severity === "SEV-1" &&
          monitor.condition.includes("integrity.violation"),
      ),
    ).toBe(true);
    expect(
      dashboard.monitors.some((monitor) =>
        monitor.condition.includes("release protection status"),
      ),
    ).toBe(true);
  });
  it("keeps the GitHub-native watchdog scheduled, Preview-scoped and incident-capable", () => {
    const workflow = readFileSync(
      ".github/workflows/observability-watchdog.yml",
      "utf8",
    );

    expect(workflow).toContain('cron: "7,37 * * * *"');
    expect(workflow).toContain("DATABASE_SCHEMA: visa_os_preview");
    expect(workflow).toContain("VERCEL_ENV: preview");
    expect(workflow).toContain("observability:watchdog:preview");
    expect(workflow).toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain("[Observability Watchdog] Active Preview incident");
    expect(workflow).toContain('state: "closed"');
    expect(workflow).not.toContain("visa.essafariavoyages.com");
    expect(workflow).not.toContain("DATABASE_SCHEMA: visa_os\n");
  });

  it("documents GitHub-native delivery as best-effort rather than SLA-grade uptime", () => {
    const policy = json<{
      notes: string[];
      github_native_watchdog?: {
        cadence?: string;
        evidence_retention_days?: number;
      };
    }>("docs/observability-alert-policy.json");

    expect(policy.notes.join(" ")).toMatch(/best-effort/i);
    expect(policy.notes.join(" ")).toMatch(/default branch/i);
    expect(policy.github_native_watchdog?.cadence).toMatch(/30 minutes/i);
    expect(policy.github_native_watchdog?.evidence_retention_days).toBe(30);
  });

});
