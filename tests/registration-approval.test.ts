import { afterEach, describe, expect, it, vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();
afterEach(() => vi.restoreAllMocks());

import { db, pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import {
  accountActivationTokens,
  agencies,
  agencyRegistrationHistory,
  agencyRegistrations,
  auditLogs,
  notifications,
  users,
  walletTransactions,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  activateAccount,
  addInternalNote,
  approveRegistration,
  createActivationTokenForRegistration,
  rejectRegistration,
  requestMoreInformation,
  resolveActivation,
  startRegistrationReview,
  submitAgencyRegistration,
  type ApprovalResult,
} from "@/lib/registrations";
import { authenticate } from "@/lib/auth";
import { hashPassword, hashToken } from "@/lib/crypto";
import { randomUUID } from "node:crypto";
import { authUser, nextIp, registrationData, registrationPdf, userByEmail } from "./helpers/fixtures";

async function submitOne(overrides: Parameters<typeof registrationData>[0] = {}) {
  const data = registrationData(overrides);
  const files = [registrationPdf()];
  const submitted = await submitAgencyRegistration({ data, files, ipAddress: nextIp() });
  return { ...submitted, data };
}

function byRole(rows: ApprovalResult[]): { fresh: ApprovalResult; idempotent: ApprovalResult } {
  const fresh = rows.find((r) => !r.alreadyApproved);
  const idem = rows.find((r) => r.alreadyApproved);
  if (!fresh || !idem) throw new Error("expected exactly one fresh and one idempotent approval");
  return { fresh, idempotent: idem };
}

describe("registration approval — authorization", () => {
  it("allows operational Staff while rejecting Agency decision actors", async () => {
    const { id } = await submitOne();
    const agent = await userByEmail("agent@test.example"); // VISA_AGENT: view-only
    const accounting = await userByEmail("accounting@test.example");
    const outsiderAdmin = authUser({ id: randomUUID(), email: "evil@agency.example", role: "AGENCY_ADMIN", agencyId: randomUUID() });
    await expect(approveRegistration({ registrationId: id, actor: agent })).resolves.toHaveProperty("agencyId");
    await expect(approveRegistration({ registrationId: id, actor: accounting })).resolves.toHaveProperty("agencyId");
    await expect(approveRegistration({ registrationId: id, actor: outsiderAdmin })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)))[0]!;
    expect(reg.status).toBe("APPROVED");
    expect(reg.agencyId).not.toBeNull();
  });
});

describe("registration approval — provisioning", () => {
  it("creates the agency and exactly one AGENCY_ADMIN, links everything, audits — and touches no wallet", async () => {
    const { id, data } = await submitOne();
    const admin = await userByEmail("admin@test.example");
    const result = await approveRegistration({ registrationId: id, actor: admin, ipAddress: "10.99.0.1" });

    expect(result.alreadyApproved).toBe(false);

    // Agency created with the EXISTING agency model — ACTIVE, wallet at 0.
    const agency = (await db.select().from(agencies).where(eq(agencies.id, result.agencyId)))[0]!;
    expect(agency.legalName).toBe(data.legalName);
    expect(agency.email).toBe(data.email);
    expect(agency.status).toBe("ACTIVE");
    expect(agency.balance).toBe("0.00");
    expect(agency.country).toBe(data.country);
    expect(agency.billingTaxId).toBe(data.taxId);

    // First user created with the EXISTING user model — role EXACTLY AGENCY_ADMIN,
    // strictly bound to the new tenant.
    const agencyUsers = await db.select().from(users).where(eq(users.agencyId, result.agencyId));
    expect(agencyUsers).toHaveLength(1);
    const adminUser = agencyUsers[0]!;
    expect(adminUser.id).toBe(result.adminUserId);
    expect(adminUser.role).toBe("AGENCY_ADMIN");
    expect(adminUser.email).toBe(data.email);
    expect(adminUser.name).toBe(`${data.contactFirstName} ${data.contactLastName}`);
    expect(adminUser.status).toBe("ACTIVE");
    // no usable plaintext password: the stored hash wraps an unknown random secret
    expect(adminUser.passwordHash.startsWith("scrypt$")).toBe(true);
    await expect(authenticate(data.email, "password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    // registration → agency → admin linked, decision recorded
    const reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)))[0]!;
    expect(reg.status).toBe("APPROVED");
    expect(reg.agencyId).toBe(result.agencyId);
    expect(reg.adminUserId).toBe(result.adminUserId);
    expect(reg.decidedBy).toBe(admin.id);
    expect(reg.decidedAt).not.toBeNull();

    const history = await db
      .select()
      .from(agencyRegistrationHistory)
      .where(eq(agencyRegistrationHistory.registrationId, id))
      .orderBy(desc(agencyRegistrationHistory.createdAt));
    expect(history.map((h) => h.toStatus)).toContain("APPROVED");

    // audit events exist
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, id));
    const actions = new Set(audit.map((a) => a.action));
    expect(actions.has("REGISTRATION_APPROVED")).toBe(true);
    const agencyAudit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, result.agencyId));
    expect(agencyAudit.some((a) => a.action === "AGENCY_CREATED")).toBe(true);
    const userAudit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, result.adminUserId));
    expect(userAudit.some((a) => a.action === "USER_CREATED")).toBe(true);

    // onboarding notification through the existing mechanism
    const welcome = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, result.adminUserId), eq(notifications.type, "AGENCY_ONBOARDED")));
    expect(welcome).toHaveLength(1);
    expect(welcome[0]!.agencyId).toBe(result.agencyId);

    // NO wallet manipulation: zero transactions, zero balance — ever.
    const txs = await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, result.agencyId));
    expect(txs).toHaveLength(0);
    const after = (await db.select().from(agencies).where(eq(agencies.id, result.agencyId)))[0]!;
    expect(after.balance).toBe("0.00");
  });

  it("is idempotent: approving twice creates exactly one agency and one user", async () => {
    const { id, data } = await submitOne();
    const admin = await userByEmail("admin@test.example");
    const first = await approveRegistration({ registrationId: id, actor: admin });
    const second = await approveRegistration({ registrationId: id, actor: admin });

    expect(second.alreadyApproved).toBe(true);
    expect(second.agencyId).toBe(first.agencyId);
    expect(second.adminUserId).toBe(first.adminUserId);

    const withName = await db.select().from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`);
    expect(withName).toHaveLength(1);
    const withEmail = await db.select().from(users).where(eq(users.email, data.email));
    expect(withEmail).toHaveLength(1);
  });

  it("serializes concurrent approvals (row lock): still exactly one agency, one user", async () => {
    const { id, data } = await submitOne();
    const admin = await userByEmail("admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");

    const results = await Promise.all([
      approveRegistration({ registrationId: id, actor: admin }),
      approveRegistration({ registrationId: id, actor: superAdmin }),
    ]);
    const { fresh, idempotent } = byRole(results);
    expect(idempotent.agencyId).toBe(fresh.agencyId);
    expect(idempotent.adminUserId).toBe(fresh.adminUserId);

    const withName = await db.select().from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`);
    expect(withName).toHaveLength(1);
    const withEmail = await db.select().from(users).where(eq(users.email, data.email));
    expect(withEmail).toHaveLength(1);

    const approvedHistory = await db
      .select()
      .from(agencyRegistrationHistory)
      .where(and(eq(agencyRegistrationHistory.registrationId, id), eq(agencyRegistrationHistory.toStatus, "APPROVED")));
    expect(approvedHistory).toHaveLength(1);
  });
});

describe("registration submission — audit atomicity", () => {
  it("rolls back the public registration when its audit row cannot be persisted", async () => {
    const fn = qualifiedTable("test_fail_registration_submission_audit");
    const audit = qualifiedTable("audit_logs");
    await pool.query(`create or replace function ${fn}() returns trigger language plpgsql as $audit$
      begin
        if new.action = 'AGENCY_REGISTRATION_SUBMITTED' then
          raise exception 'synthetic registration audit failure';
        end if;
        return new;
      end
    $audit$`);
    await pool.query(`drop trigger if exists test_fail_registration_submission_audit on ${audit}`);
    await pool.query(`create trigger test_fail_registration_submission_audit before insert on ${audit}
      for each row execute function ${fn}()`);
    const data = registrationData({
      legalName: `Audit Rollback Travel ${randomUUID()}`,
      email: `audit-rollback-${randomUUID()}@example.test`,
      contactEmail: `audit-rollback-${randomUUID()}@example.test`,
    });
    const [auditBefore] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs)
      .where(eq(auditLogs.action, "AGENCY_REGISTRATION_SUBMITTED"));
    try {
      await expect(submitAgencyRegistration({ data, files: [], ipAddress: nextIp() }))
        .rejects.toThrow();
      const rows = await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.email, data.email));
      expect(rows).toHaveLength(0);
      const [auditAfter] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs)
        .where(eq(auditLogs.action, "AGENCY_REGISTRATION_SUBMITTED"));
      expect(auditAfter?.n).toBe(auditBefore?.n);
    } finally {
      await pool.query(`drop trigger if exists test_fail_registration_submission_audit on ${audit}`);
      await pool.query(`drop function if exists ${fn}()`);
    }
  });
});

describe("registration approval — failure safety", () => {
  it("permits a shared mailbox across independent username identities", async () => {
    const {id,data}=await submitOne();
    await db.insert(users).values({email:data.email,passwordHash:await hashPassword("Existing!23456"),name:"Existing Staff",role:"VISA_AGENT"});
    const approved=await approveRegistration({registrationId:id,actor:await userByEmail("admin@test.example")});
    const agencyUsers=await db.select().from(users).where(eq(users.agencyId,approved.agencyId));
    expect(agencyUsers).toHaveLength(1);
    expect(agencyUsers[0]!.username).toBeTruthy();
    expect(agencyUsers[0]!.email).toBe(data.email);
  });
  it("shows an agency identity match while preserving the explicit Staff decision", async () => {
    const {id,data}=await submitOne();
    await db.insert(agencies).values({legalName:data.legalName,email:"existing@tenant.example"});
    await expect(approveRegistration({registrationId:id,actor:await userByEmail("admin@test.example")})).resolves.toHaveProperty("agencyId");
  });
});

describe("registration workflow — review, info requests, notes, rejection", () => {
  it("moves through review and information requests with audited history", async () => {
    const { id } = await submitOne();
    const admin = await userByEmail("admin@test.example");

    await startRegistrationReview(id, admin);
    let reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)))[0]!;
    expect(reg.status).toBe("UNDER_REVIEW");
    expect(reg.reviewedBy).toBe(admin.id);

    await expect(requestMoreInformation(id, admin, "short")).rejects.toMatchObject({ code: "VALIDATION" });
    await requestMoreInformation(id, admin, "Please provide an updated commercial registration extract.");
    reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)))[0]!;
    expect(reg.status).toBe("MORE_INFORMATION_REQUIRED");

    await addInternalNote(id, admin, "Called the contact — CR extract will be resent.");
    reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)))[0]!;
    expect(reg.internalNotes).toContain("Called the contact");

    const history = await db
      .select()
      .from(agencyRegistrationHistory)
      .where(eq(agencyRegistrationHistory.registrationId, id));
    const transitions = history.map((h) => `${h.kind}:${h.fromStatus}->${h.toStatus}`);
    expect(transitions).toContain("STATUS:PENDING->UNDER_REVIEW");
    expect(transitions).toContain("INFO_REQUEST:UNDER_REVIEW->MORE_INFORMATION_REQUIRED");
    expect(history.some((h) => h.kind === "NOTE")).toBe(true);
  });

  it("rejects with a mandatory reason and keeps the record (no agency, no access, no credit)", async () => {
    const { id, data } = await submitOne();
    const admin = await userByEmail("admin@test.example");

    await expect(rejectRegistration(id, admin, "no")).rejects.toMatchObject({ code: "VALIDATION" });
    await rejectRegistration(id, admin, "Licence number could not be verified with the issuer.");
    const reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)))[0]!;
    expect(reg.status).toBe("REJECTED");
    expect(reg.rejectionReason).toContain("Licence");
    expect(reg.decidedBy).toBe(admin.id);

    // no active agency / portal access / wallet credit materialized
    const created = await db.select().from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`);
    expect(created).toHaveLength(0);
    const noUsers = await db.select().from(users).where(eq(users.email, data.email));
    expect(noUsers).toHaveLength(0);

    // a rejected application cannot be approved directly…
    await expect(approveRegistration({ registrationId: id, actor: admin })).rejects.toMatchObject({ code: "INVALID_STATE" });
    // …but an authorized admin may reopen it through review, then approve
    await startRegistrationReview(id, admin);
    const result = await approveRegistration({ registrationId: id, actor: admin });
    expect(result.alreadyApproved).toBe(false);
  });

  it("enforces tenant binding at the database level (role/agency check)", async () => {
    await expect(
      db.insert(users).values({
        email: "unbound@evil.example",
        passwordHash: "scrypt$00$00",
        name: "Unbound",
        role: "AGENCY_ADMIN",
        agencyId: null,
      }),
    ).rejects.toThrow();
  });
});

describe("account activation — secure set-password flow", () => {
  it("issues, resolves and consumes a single-use activation token; the user can then authenticate", async () => {
    const { id, data } = await submitOne({ locale: "ar" });
    const admin = await userByEmail("superadmin@test.example");
    const approved = await approveRegistration({ registrationId: id, actor: admin });

    const issued = await createActivationTokenForRegistration(id, admin);
    expect(issued.email).toBe(data.email);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const info = await resolveActivation(issued.token);
    expect(info?.email).toBe(data.email);
    expect(info?.userId).toBe(approved.adminUserId);
    expect(info?.locale).toBe("ar"); // registration locale drives status communication

    await expect(activateAccount(issued.token, "short")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    await expect(activateAccount(issued.token, "lettersOnlyPassword")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    await expect(activateAccount(issued.token, "12345678901")).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    const activated = await activateAccount(issued.token, "NewSecure!2345", "10.5.0.1");
    expect(activated.role).toBe("AGENCY_ADMIN");
    expect(activated.agencyId).toBe(approved.agencyId);

    // single-use: resolving or reusing the same token must fail
    expect(await resolveActivation(issued.token)).toBeNull();
    await expect(activateAccount(issued.token, "NewSecure!2345")).rejects.toMatchObject({ code: "INVALID_TOKEN" });

    // the new password authenticates through the existing auth architecture
    const authed = await authenticate(activated.username!, "NewSecure!2345");
    expect(authed.role).toBe("AGENCY_ADMIN");

    // audit trail of link issuance + activation
    const linkAudit = await db.select().from(auditLogs).where(eq(auditLogs.action, "ACTIVATION_LINK_CREATED"));
    expect(linkAudit.some((a) => a.entityId === approved.adminUserId)).toBe(true);
    const activationAudit = await db.select().from(auditLogs).where(eq(auditLogs.action, "ACCOUNT_ACTIVATED"));
    expect(activationAudit.some((a) => a.entityId === approved.adminUserId)).toBe(true);
  });

  it("revokes previous links when a new one is generated, and refuses expired tokens", async () => {
    const { id } = await submitOne();
    const admin = await userByEmail("superadmin@test.example");
    await approveRegistration({ registrationId: id, actor: admin });

    const first = await createActivationTokenForRegistration(id, admin);
    const second = await createActivationTokenForRegistration(id, admin);
    expect(await resolveActivation(first.token)).toBeNull(); // revoked
    expect(await resolveActivation(second.token)).not.toBeNull();

    // force expiry on the live token
    await db
      .update(accountActivationTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(accountActivationTokens.tokenHash, hashToken(second.token)));
    expect(await resolveActivation(second.token)).toBeNull();
    await expect(activateAccount(second.token, "Whatever!23456")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("only issues activation links for approved registrations", async () => {
    const { id } = await submitOne();
    const admin = await userByEmail("superadmin@test.example");
    await expect(createActivationTokenForRegistration(id, admin)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
