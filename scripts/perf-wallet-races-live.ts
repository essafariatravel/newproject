import "./lib/load-env";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { applicants, checklistItems, walletTopupRequests, walletTransactions } from "../src/db/schema";
import { createDraftApplication, submitApplication } from "../src/lib/applications";
import { uploadDocument } from "../src/lib/documents";
import { adjustWallet, getBalance } from "../src/lib/wallet";
import { createTopupRequest, processTopupRequest } from "../src/lib/topup";
import type { AuthUser, Role } from "../src/lib/types";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

type AppFixture = { id: string; fee: number };

function assertLiveAck() {
  if (process.env.PERF_ALLOW_LIVE_WALLET !== "YES") {
    throw new Error("Set PERF_ALLOW_LIVE_WALLET=YES only for the approved isolated non-Production wallet race run.");
  }
}

async function actorByEmail(email: string): Promise<AuthUser> {
  const result = await pool.query<{
    id: string;
    email: string;
    username: string | null;
    name: string;
    role: string;
    agency_id: string | null;
    user_status: string;
    agency_status: string | null;
    agency_name: string | null;
    must_change_password: boolean;
  }>(
    `select u.id,u.email,u.username,u.name,u.role,u.agency_id,
            u.status as user_status,a.status as agency_status,a.legal_name as agency_name,
            u.must_change_password
       from ${perfTable("users")} u
       left join ${perfTable("agencies")} a on a.id=u.agency_id
      where lower(u.email)=lower($1)
      limit 1`,
    [email],
  );
  const row = result.rows[0];
  if (!row || row.user_status !== "ACTIVE" || row.must_change_password ||
      (row.agency_id && row.agency_status !== "ACTIVE")) {
    throw new Error(`Synthetic actor ${email} is missing or inactive. Run perf-seed-identities first.`);
  }
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    role: row.role as Role,
    agencyId: row.agency_id,
    userStatus: row.user_status,
    agencyStatus: row.agency_status,
    agencyName: row.agency_name,
    mustChangePassword: row.must_change_password,
  };
}

async function compatibleVisaTypeId(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `select vt.id
       from ${perfTable("visa_types")} vt
      where vt.active
        and not exists (
          select 1
            from ${perfTable("visa_requirements")} vr
            join ${perfTable("document_types")} dt on dt.id=vr.document_type_id
           where vr.visa_type_id=vt.id
             and vr.required
             and (not dt.active or not dt.agency_uploadable)
        )
      order by (
        select count(*)
          from ${perfTable("visa_requirements")} vr2
         where vr2.visa_type_id=vt.id and vr2.required
      ), vt.code
      limit 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("No active visa type is compatible with synthetic Agency submission.");
  return row.id;
}

function syntheticPdf(bytes = 1024): Buffer {
  const header = Buffer.from("%PDF-1.4\n%PERF\n");
  return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length), 1)]);
}

async function makeSubmittableApplication(params: {
  agencyId: string;
  agencyActor: AuthUser;
  visaTypeId: string;
  marker: string;
  serial: number;
}): Promise<AppFixture> {
  const app = await createDraftApplication({
    agencyId: params.agencyId,
    visaTypeId: params.visaTypeId,
    agencyNotes: params.marker,
    createdBy: params.agencyActor,
  });

  const suffix = `${Date.now().toString(36)}${params.serial.toString(36)}`.toUpperCase().slice(-12);
  await db.insert(applicants).values({
    applicationId: app.id,
    firstName: "PERF",
    lastName: `WalletRace${params.serial}`,
    dateOfBirth: "1990-01-01",
    nationality: "Algerian",
    passportNumber: `PFR${suffix}`,
    passportExpiryDate: "2035-01-01",
  });

  const required = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.applicationId, app.id), eq(checklistItems.required, true)));

  for (const item of required) {
    const data = syntheticPdf();
    await uploadDocument({
      applicationId: app.id,
      actor: params.agencyActor,
      checklistItemId: item.id,
      file: {
        name: `perf-${item.documentTypeCode}.pdf`,
        type: "application/pdf",
        size: data.length,
        data,
      },
    });
  }

  return { id: app.id, fee: Number(app.fee) };
}

async function normalizeWallet(agencyId: string, actor: AuthUser, target: number, reason: string) {
  const before = Number((await getBalance(agencyId)).balance);
  if (before > 0) {
    await adjustWallet({
      agencyId,
      amount: -before,
      reason: `${reason}: normalize to zero`,
      actor,
    });
  }
  const afterZero = Number((await getBalance(agencyId)).balance);
  if (Math.abs(afterZero) > 0.005) throw new Error(`Wallet normalization failed; got ${afterZero}.`);
  if (target > 0) {
    await adjustWallet({
      agencyId,
      amount: target,
      reason: `${reason}: synthetic funding`,
      actor,
    });
  }
}

async function applicationCharges(ids: string[]) {
  if (ids.length === 0) return [];
  const result = await pool.query<{
    application_id: string;
    amount: string;
    balance_before: string;
    balance_after: string;
    reference: string | null;
  }>(
    `select application_id,amount::text,balance_before::text,balance_after::text,reference
       from ${perfTable("wallet_transactions")}
      where type='APPLICATION_CHARGE'
        and application_id=any($1::uuid[])
      order by created_at,id`,
    [ids],
  );
  return result.rows;
}

function assertChargeArithmetic(rows: Awaited<ReturnType<typeof applicationCharges>>) {
  for (const row of rows) {
    const before = Number(row.balance_before);
    const amount = Number(row.amount);
    const after = Number(row.balance_after);
    if (after < -0.005) throw new Error("Negative wallet balance detected in charge ledger.");
    if (Math.abs((before - amount) - after) > 0.005) {
      throw new Error("Invalid before/after arithmetic in application charge.");
    }
  }
}

async function sameApplicationRace(params: {
  count: number;
  agencyId: string;
  agencyActor: AuthUser;
  accounting: AuthUser;
  visaTypeId: string;
  marker: string;
  serial: number;
}) {
  const app = await makeSubmittableApplication({
    agencyId: params.agencyId,
    agencyActor: params.agencyActor,
    visaTypeId: params.visaTypeId,
    marker: params.marker,
    serial: params.serial,
  });
  await normalizeWallet(params.agencyId, params.accounting, app.fee * 2, `${params.marker}:same-${params.count}`);

  const started = performance.now();
  const outcomes = await Promise.allSettled(
    Array.from({ length: params.count }, () =>
      submitApplication({ applicationId: app.id, actor: params.agencyActor }),
    ),
  );
  const durationMs = performance.now() - started;
  const fulfilled = outcomes.filter((result) => result.status === "fulfilled").length;
  const charges = await applicationCharges([app.id]);
  if (fulfilled !== 1 || charges.length !== 1) {
    throw new Error(`Same-application race ${params.count} expected one success/charge; got ${fulfilled}/${charges.length}.`);
  }
  assertChargeArithmetic(charges);
  return { count: params.count, fulfilled, charges: charges.length, durationMs };
}

async function distinctRace(params: {
  count: number;
  fundedFor: number;
  agencyId: string;
  agencyActor: AuthUser;
  accounting: AuthUser;
  visaTypeId: string;
  marker: string;
  serialStart: number;
}) {
  const apps: AppFixture[] = [];
  for (let i = 0; i < params.count; i++) {
    apps.push(await makeSubmittableApplication({
      agencyId: params.agencyId,
      agencyActor: params.agencyActor,
      visaTypeId: params.visaTypeId,
      marker: params.marker,
      serial: params.serialStart + i,
    }));
  }
  const fee = apps[0]?.fee ?? 0;
  if (fee <= 0 || !apps.every((app) => Math.abs(app.fee - fee) < 0.005)) {
    throw new Error("Race fixtures do not have a stable positive fee.");
  }

  await normalizeWallet(params.agencyId, params.accounting, fee * params.fundedFor, `${params.marker}:distinct-${params.count}`);
  const started = performance.now();
  const outcomes = await Promise.allSettled(
    apps.map((app) => submitApplication({ applicationId: app.id, actor: params.agencyActor })),
  );
  const durationMs = performance.now() - started;
  const fulfilled = outcomes.filter((result) => result.status === "fulfilled").length;
  const charges = await applicationCharges(apps.map((app) => app.id));

  if (fulfilled !== params.fundedFor || charges.length !== params.fundedFor) {
    throw new Error(
      `Distinct race ${params.count} funded for ${params.fundedFor}: expected ${params.fundedFor} success/charges; got ${fulfilled}/${charges.length}.`,
    );
  }
  if (new Set(charges.map((row) => row.application_id)).size !== charges.length) {
    throw new Error("Duplicate application charge detected.");
  }
  assertChargeArithmetic(charges);
  const finalBalance = Number((await getBalance(params.agencyId)).balance);
  if (Math.abs(finalBalance) > 0.005) throw new Error(`Expected zero final balance; got ${finalBalance}.`);

  return { count: params.count, fundedFor: params.fundedFor, fulfilled, charges: charges.length, durationMs };
}

async function adjustmentDuringSubmissions(params: {
  agencyId: string;
  agencyActor: AuthUser;
  accounting: AuthUser;
  visaTypeId: string;
  marker: string;
  serialStart: number;
}) {
  const apps: AppFixture[] = [];
  for (let i = 0; i < 10; i++) {
    apps.push(await makeSubmittableApplication({
      agencyId: params.agencyId,
      agencyActor: params.agencyActor,
      visaTypeId: params.visaTypeId,
      marker: params.marker,
      serial: params.serialStart + i,
    }));
  }
  const fee = apps[0]!.fee;
  const adjustment = 123.45;
  await normalizeWallet(params.agencyId, params.accounting, fee * 10, `${params.marker}:adjustment-race`);

  const outcomes = await Promise.allSettled([
    ...apps.map((app) => submitApplication({ applicationId: app.id, actor: params.agencyActor })),
    adjustWallet({
      agencyId: params.agencyId,
      amount: adjustment,
      reason: `${params.marker}: concurrent manual credit`,
      actor: params.accounting,
    }),
  ]);
  const submitFulfilled = outcomes.slice(0, 10).filter((result) => result.status === "fulfilled").length;
  if (submitFulfilled !== 10 || outcomes[10]?.status !== "fulfilled") {
    throw new Error("Concurrent adjustment scenario did not complete all valid operations.");
  }
  const charges = await applicationCharges(apps.map((app) => app.id));
  if (charges.length !== 10) throw new Error("Concurrent adjustment scenario lost or duplicated a charge.");
  assertChargeArithmetic(charges);
  const finalBalance = Number((await getBalance(params.agencyId)).balance);
  if (Math.abs(finalBalance - adjustment) > 0.005) {
    throw new Error(`Concurrent adjustment expected final balance ${adjustment}; got ${finalBalance}.`);
  }
  return { submissions: 10, adjustment, finalBalance };
}

async function topupRace(params: {
  agencyId: string;
  agencyAdmin: AuthUser;
  accounting: AuthUser;
  admin: AuthUser;
  marker: string;
}) {
  const pdf = syntheticPdf(2048);
  const request = await createTopupRequest({
    agencyId: params.agencyId,
    amount: 777.77,
    note: params.marker,
    actor: params.agencyAdmin,
    proof: { name: "perf-topup-proof.pdf", type: "application/pdf", size: pdf.length, data: pdf },
    idempotencyKey: randomUUID(),
  });

  const before = Number((await getBalance(params.agencyId)).balance);
  const outcomes = await Promise.allSettled([
    processTopupRequest({
      requestId: request.id,
      actor: params.accounting,
      decision: "CREDIT",
      decisionNote: params.marker,
    }),
    processTopupRequest({
      requestId: request.id,
      actor: params.admin,
      decision: "CREDIT",
      decisionNote: params.marker,
    }),
  ]);
  const fulfilled = outcomes.filter((result) => result.status === "fulfilled").length;
  if (fulfilled !== 1) throw new Error(`Top-up race expected one successful processor; got ${fulfilled}.`);

  const row = await db
    .select()
    .from(walletTopupRequests)
    .where(eq(walletTopupRequests.id, request.id))
    .limit(1);
  if (!row[0] || row[0].status !== "PROCESSED" || !row[0].walletTransactionId) {
    throw new Error("Top-up race did not persist one processed request linked to the ledger.");
  }

  const linked = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.id, row[0].walletTransactionId))
    .limit(1);
  if (linked.length !== 1 || linked[0]!.type !== "CREDIT") {
    throw new Error("Top-up request does not link to exactly one credit.");
  }

  const after = Number((await getBalance(params.agencyId)).balance);
  if (Math.abs((before + 777.77) - after) > 0.005) {
    throw new Error("Top-up race credited an incorrect amount.");
  }

  const retry = await Promise.allSettled([
    processTopupRequest({
      requestId: request.id,
      actor: params.accounting,
      decision: "CREDIT",
      decisionNote: `${params.marker}:retry`,
    }),
  ]);
  if (retry[0]?.status !== "rejected") throw new Error("Repeated top-up approval unexpectedly succeeded.");

  const linkedAfter = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.id, row[0].walletTransactionId))
    .limit(2);
  if (linkedAfter.length !== 1) throw new Error("Repeated top-up processing duplicated the credit.");

  return { fulfilled, status: row[0].status, amount: 777.77, balanceBefore: before, balanceAfter: after };
}

async function proveLedgerImmutability(agencyId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const tx = await client.query<{ id: string }>(
      `select id from ${perfTable("wallet_transactions")} where agency_id=$1 order by created_at desc limit 1`,
      [agencyId],
    );
    if (!tx.rows[0]) throw new Error("No synthetic wallet transaction exists for immutability proof.");
    let rejected = false;
    try {
      await client.query(
        `update ${perfTable("wallet_transactions")} set reason=reason where id=$1`,
        [tx.rows[0].id],
      );
    } catch {
      rejected = true;
    }
    await client.query("rollback");
    if (!rejected) throw new Error("Wallet ledger UPDATE was not rejected by the database.");
    return true;
  } finally {
    client.release();
  }
}

async function assertNoNegativeLedger(agencyId: string) {
  const result = await pool.query<{ minimum: string | null }>(
    `select min(balance_after)::text as minimum
       from ${perfTable("wallet_transactions")}
      where agency_id=$1`,
    [agencyId],
  );
  const minimum = result.rows[0]?.minimum === null ? 0 : Number(result.rows[0]?.minimum);
  if (minimum < -0.005) throw new Error(`Negative wallet ledger balance detected: ${minimum}.`);
  return minimum;
}

async function main() {
  const target = assertSafePerfTarget();
  assertLiveAck();

  const agencyAdmin = await actorByEmail("perf.agencyadmin@load.example");
  const accounting = await actorByEmail("perf.accounting@load.example");
  const admin = await actorByEmail("perf.admin@load.example");
  if (!agencyAdmin.agencyId) throw new Error("Synthetic Agency Admin has no agency.");
  const agencyId = agencyAdmin.agencyId;
  const visaTypeId = await compatibleVisaTypeId();
  const runId = randomUUID();
  const marker = `PERF_WALLET_RACE:${runId}`;

  const same: unknown[] = [];
  let serial = 1;
  for (const count of [2, 10, 50]) {
    same.push(await sameApplicationRace({
      count,
      agencyId,
      agencyActor: agencyAdmin,
      accounting,
      visaTypeId,
      marker,
      serial: serial++,
    }));
  }

  const distinct: unknown[] = [];
  for (const count of [2, 10, 50]) {
    distinct.push(await distinctRace({
      count,
      fundedFor: count,
      agencyId,
      agencyActor: agencyAdmin,
      accounting,
      visaTypeId,
      marker,
      serialStart: serial,
    }));
    serial += count;
  }

  const constrained = await distinctRace({
    count: 50,
    fundedFor: 10,
    agencyId,
    agencyActor: agencyAdmin,
    accounting,
    visaTypeId,
    marker,
    serialStart: serial,
  });
  serial += 50;

  const adjustment = await adjustmentDuringSubmissions({
    agencyId,
    agencyActor: agencyAdmin,
    accounting,
    visaTypeId,
    marker,
    serialStart: serial,
  });

  const topup = await topupRace({ agencyId, agencyAdmin, accounting, admin, marker });
  const immutable = await proveLedgerImmutability(agencyId);
  const minimumBalanceAfter = await assertNoNegativeLedger(agencyId);

  console.log(JSON.stringify({
    ok: true,
    target: safeTargetSummary(target),
    runId,
    marker,
    sameApplicationRaces: same,
    distinctRaces: distinct,
    constrainedFundsRace: constrained,
    adjustmentDuringSubmissions: adjustment,
    topupRace: topup,
    ledgerImmutable: immutable,
    minimumBalanceAfter,
    note: "All data is synthetic PERF_* data. Immutable financial history is intentionally retained for audit evidence.",
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Live wallet race suite failed.");
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
