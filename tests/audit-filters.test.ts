import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import { listAuditLogs } from "@/lib/queries";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";

suiteSetup();

let actorId: string;
let agencyId: string;
const marker = "audit-filter-check";

beforeAll(async () => {
  const actor = await userByEmail("agent@test.example");
  const otherActor = await userByEmail("accounting@test.example");
  const agency = await agencyByEmail("ops@agencya.example");
  const otherAgency = await agencyByEmail("ops@agencyb.example");
  actorId = actor.id;
  agencyId = agency.id;
  const base = { actorId, agencyId, actorEmail: `${marker}@example.test`, action: "WALLET_CREDIT", entity: "wallet_transaction" };
  await db.insert(auditLogs).values([
    { ...base, entityId: "start", createdAt: new Date("2026-06-10T00:00:00.000Z") },
    { ...base, entityId: "end", createdAt: new Date("2026-06-10T23:59:59.999Z") },
    { ...base, entityId: "before", createdAt: new Date("2026-06-09T23:59:59.999Z") },
    { ...base, entityId: "after", createdAt: new Date("2026-06-11T00:00:00.000Z") },
    { ...base, entityId: "other-actor", actorId: otherActor.id, createdAt: new Date("2026-06-10T12:00:00Z") },
    { ...base, entityId: "other-agency", agencyId: otherAgency.id, createdAt: new Date("2026-06-10T12:00:00Z") },
    { ...base, entityId: "other-action", action: "WALLET_DEBIT", createdAt: new Date("2026-06-10T12:00:00Z") },
    { ...base, entityId: "other-entity", entity: "agency", createdAt: new Date("2026-06-10T12:00:00Z") },
    { ...base, entityId: "system", actorId: null, actorEmail: null, action: "AUDIT_FILTER_SYSTEM", createdAt: new Date("2026-06-10T12:00:00Z") },
    { ...base, entityId: "deleted-user", actorId: null, action: "AUDIT_FILTER_SYSTEM", createdAt: new Date("2026-06-10T12:00:00Z") },
    ...Array.from({ length: 24 }, (_, index) => ({ ...base, entityId: `page-${index}`, createdAt: new Date("2026-05-01T12:00:00Z") })),
  ]);
});

describe("audit filter read model", () => {
  it("combines search, actor, agency, exact action, entity and inclusive UTC days", async () => {
    const result = await listAuditLogs({ q: marker, actorId, agencyId, action: "WALLET_CREDIT", entity: "wallet_transaction", from: "2026-06-10", to: "2026-06-10" });
    expect(result.filterError).toBeUndefined();
    expect(result.total).toBe(2);
    expect(result.rows.map(({ log }) => log.entityId)).toEqual(["end", "start"]);
    expect((await listAuditLogs({ q: marker, action: "WALLET" })).total).toBe(0);
  });

  it("keeps options available when filters match no entries", async () => {
    const result = await listAuditLogs({ q: "no-audit-entry-matches-this" });
    expect(result.total).toBe(0);
    expect(result.filterOptions).toContainEqual({ action: "WALLET_CREDIT", entity: "wallet_transaction" });
  });

  it("returns actionable errors and no rows for malformed identifiers or dates", async () => {
    for (const filters of [
      { agencyId: "not-a-uuid" }, { actorId: "not-a-uuid" },
      { from: "2026-02-30" }, { to: "not-a-date" }, { from: "2026-06-11", to: "2026-06-10" },
    ]) {
      const result = await listAuditLogs(filters);
      expect(result.filterError).toBeTruthy();
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    }
  });

  it("honors supported page sizes and uses stable pages for equal timestamps", async () => {
    const filters = { q: marker, actorId, agencyId, action: "WALLET_CREDIT", entity: "wallet_transaction" };
    const all = await listAuditLogs({ ...filters, pageSize: 50 });
    expect(all.pageSize).toBe(50);
    expect(all.rows).toHaveLength(28);
    const first = await listAuditLogs({ ...filters, pageSize: 20, page: 1 });
    const second = await listAuditLogs({ ...filters, pageSize: 20, page: 2 });
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(8);
    expect(new Set([...first.rows, ...second.rows].map(({ log }) => log.id)).size).toBe(28);
    expect((await listAuditLogs({ ...filters, page: Number.POSITIVE_INFINITY })).page).toBe(1);
    expect((await listAuditLogs({ ...filters, page: 999 })).page).toBe(2);
  });

  it("distinguishes system actions from retained audit records for deleted users", async () => {
    const result = await listAuditLogs({ actorId: "system", action: "AUDIT_FILTER_SYSTEM" });
    expect(result.rows.map(({ log }) => log.entityId)).toEqual(["system"]);
  });
});
