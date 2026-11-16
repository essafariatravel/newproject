/**
 * RENDERED-AUDIT STATE PREP (local schemas only)
 * ---------------------------------------------------------------------------
 * The rendered audit inspects real server-rendered HTML, but a page can only be
 * inspected in the states that exist in the database. This script drives the
 * REAL application services (submitApplication / uploadDocument / reviewDocument /
 * document request / top-up services) against the LOCAL database so every UI
 * state the specification talks about actually exists, then writes the ids to
 * /tmp/rendered-state.json for scripts/rendered-audit.mjs.
 *
 * It refuses to run against a non-local database: the state it creates is demo
 * state and must never touch Preview or Production.
 */
import "./lib/load-env";
import { writeFileSync } from "node:fs";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import {
  agencies,
  applications,
  checklistItems,
  communications,
  documentRequests,
  documentTypes,
  documents,
  users,
  walletTopupRequests,
} from "@/db/schema";
import type { AuthUser, Role } from "@/lib/types";
import { uploadDocument, reviewDocument } from "@/lib/documents";
import { requestAdditionalDocument, requestDocumentReplacement } from "@/lib/document-requests";
import { createTopupRequest, processTopupRequest } from "@/lib/topup";
import { adjustWallet, getBalance } from "@/lib/wallet";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(dbUrl) || /supabase|pooler/.test(dbUrl)) {
  throw new Error("rendered-state.ts only runs against a local database (guard tripped).");
}

function actorFrom(u: { id: string; email: string; name: string; role: string; agencyId: string | null; status: string }, agency?: { legalName: string; status: string } | null): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    agencyId: u.agencyId,
    userStatus: u.status,
    agencyStatus: agency?.status ?? null,
    agencyName: agency?.legalName ?? null,
  };
}

const receipt = (name: string, size = 48 * 1024): Buffer =>
  Buffer.concat([Buffer.from(`%PDF-1.4\n% rendered audit fixture: ${name}\n`), Buffer.alloc(Math.max(0, size - 64), 0x20)]);

async function main() {
  const state: Record<string, unknown> = {};

  const agencyRow = (
    await db.select().from(agencies).where(eq(agencies.legalName, "Horizon Voyages SARL")).limit(1)
  )[0] ?? (await db.select().from(agencies).limit(1))[0];
  if (!agencyRow) throw new Error("no agency in the local database — run `npm run db:seed` first");
  state.agencyId = agencyRow.id;

  const agencyUser = (
    await db
      .select()
      .from(users)
      .where(and(eq(users.agencyId, agencyRow.id), eq(users.role, "AGENCY_ADMIN")))
      .limit(1)
  )[0];
  if (!agencyUser) throw new Error("no AGENCY_ADMIN in the local database");
  const agencyActor = actorFrom(agencyUser, agencyRow);

  const staffUser = (
    await db
      .select()
      .from(users)
      .where(and(isNull(users.agencyId), ne(users.role, "VISA_AGENT")))
      .orderBy(desc(users.role))
      .limit(1)
  )[0];
  if (!staffUser) throw new Error("no staff user in the local database");
  const staffActor = actorFrom(staffUser, null);
  state.staffId = staffUser.id;

  const appRow = (
    await db.select().from(applications).where(eq(applications.agencyId, agencyRow.id)).limit(1)
  )[0];
  if (!appRow) throw new Error("the demo agency has no application — run `npm run db:seed`");
  const app = appRow;
  state.applicationId = app.id;
  state.reference = app.reference;

  // Give the dossier a funded wallet so billing panels show real movement.
  const balance = await getBalance(agencyRow.id);
  if (Number(balance) < 4000) {
    await adjustWallet({
      agencyId: agencyRow.id,
      amount: 250_000,
      reason: "Rendered audit fixture — opening balance",
      actor: staffActor,
    });
  }
  state.balanceAfterFunding = await getBalance(agencyRow.id);

  /* ------------------------------------------------------------------------ *
   * Documents — drive the REAL locked-document workflow so every state the UI
   * claims to render actually exists:
   *   1. submission locked the dossier (agency cannot upload)
   *   2. staff requests a replacement on slot #1  -> agency uploads v1 -> accepted
   *   3. staff requests a replacement on slot #2  -> agency uploads v1 -> staff
   *      asks for it again (RESUBMISSION_REQUIRED) -> renders "Replacement requested"
   *   4. staff requests an ADDITIONAL document     -> stays OPEN for the agency
   * ------------------------------------------------------------------------ */
  const items = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
  const withTypes = items.filter((i) => i.documentTypeId);
  if (withTypes.length < 2) throw new Error("the seeded dossier has fewer than two document requirements");

  const typeNameOf = async (documentTypeId: string) =>
    (await db.select().from(documentTypes).where(eq(documentTypes.id, documentTypeId)).limit(1))[0]?.name ?? "Document";

  const lockedAttempt = await uploadDocument({
    applicationId: app.id,
    actor: agencyActor,
    checklistItemId: withTypes[0]!.id,
    file: { name: "locked-attempt.pdf", type: "application/pdf", size: 1024, data: receipt("locked") },
  }).then(
    () => ({ blocked: false }),
    (error: unknown) => ({ blocked: (error as { code?: string }).code === "UPLOAD_NOT_ALLOWED" }),
  );
  state.lockedUploadBlocked = lockedAttempt.blocked;

  async function resolveOpenRequest(itemId: string) {
    const open = await db
      .select()
      .from(documentRequests)
      .where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))
      .limit(1);
    return open[0]?.checklistItemId === itemId ? open[0] : null;
  }

  async function flow(item: (typeof withTypes)[number], review: "ACCEPT" | "ASK_AGAIN") {
    const existing = (
      await db.select({ id: documents.id }).from(documents).where(eq(documents.checklistItemId, item.id)).limit(1)
    )[0];
    if (!existing) {
      await requestDocumentReplacement({
        applicationId: app.id,
        checklistItemId: item.id,
        reason: "Please send a full-page colour scan with the stamp visible.",
        actor: staffActor,
      });
      const typeName = await typeNameOf(item.documentTypeId!);
      const file = receipt(typeName);
      const row = (await uploadDocument({
        applicationId: app.id,
        actor: agencyActor,
        checklistItemId: item.id,
        file: {
          name: `${typeName.toLowerCase().replace(/[^a-z]+/g, "-")}.pdf`,
          type: "application/pdf",
          size: file.byteLength,
          data: file,
        },
      })) as { id: string };
      if (review === "ACCEPT") {
        await reviewDocument({ documentId: row.id, actor: staffActor, status: "ACCEPTED", reviewNotes: "Clean scan, readable." });
      } else {
        await reviewDocument({
          documentId: row.id,
          actor: staffActor,
          status: "RESUBMISSION_REQUIRED",
          rejectionReason: "The bank stamp is cut off — please resend the complete page.",
        });
      }
      return row.id;
    }
    const open = await resolveOpenRequest(item.id);
    if (open) return existing.id;
    return existing.id;
  }

  state.acceptedDocumentId = await flow(withTypes[0]!, "ACCEPT");
  state.replacementDocumentId = await flow(withTypes[1]!, "ASK_AGAIN");

  const additionalType = (
    await db
      .select()
      .from(documentTypes)
      .where(and(eq(documentTypes.active, true), eq(documentTypes.agencyUploadable, true)))
      .limit(40)
  ).find((t) => !withTypes.some((i) => i.documentTypeId === t.id));
  if (additionalType) {
    const already = await db
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .where(and(eq(checklistItems.applicationId, app.id), eq(checklistItems.documentTypeId, additionalType.id)))
      .limit(1);
    if (!already[0]) {
      await requestAdditionalDocument({
        applicationId: app.id,
        documentTypeId: additionalType.id,
        reason: "The consulate now asks for this as well for this nationality.",
        actor: staffActor,
      });
      state.additionalDocumentType = additionalType.name;
    }
  }

  /* ------------------------- communications (3 messages) ------------------------- */
  const agencyMessage = "Good morning — the traveler asked whether we should add the previous Schengen visa page to the file.";
  const internalNote = "Internal: applicant's previous refusal was in 2023; keep the cover letter conservative.";
  const staffReply = "Yes please — a copy of the previous visa page strengthens the file. Nothing else is needed from you today.";
  state.agencyMessage = agencyMessage;
  state.internalNote = internalNote;
  state.staffReply = staffReply;
  const thread = await db
    .select({ id: communications.id })
    .from(communications)
    .where(eq(communications.applicationId, app.id))
    .limit(1);
  if (!thread[0]) {
    await db.insert(communications).values([
      { applicationId: app.id, authorId: agencyUser.id, visibility: "AGENCY", body: agencyMessage },
      { applicationId: app.id, authorId: staffUser.id, visibility: "INTERNAL", body: internalNote },
      { applicationId: app.id, authorId: staffUser.id, visibility: "AGENCY", body: staffReply },
    ]);
  }

  /* ------------------------------------------------------------------------ *
   * Top-up states — the agency must see BOTH an open request and a decided one
   * with the staff reason, and staff must see the request in the billing queue.
   * A pending request blocks new ones (by design), so a pending request is
   * rejected first to produce a real decided state, then a fresh pending request
   * is created for the agency to watch.
   * ------------------------------------------------------------------------ */
  const REJECT_REASON = "Transfer reference could not be matched — please resend the bank receipt.";
  const pendingOf = async () =>
    (
      await db
        .select()
        .from(walletTopupRequests)
        .where(and(eq(walletTopupRequests.agencyId, agencyRow.id), eq(walletTopupRequests.status, "PENDING")))
        .limit(1)
    )[0];
  const decidedOf = async (status: string) =>
    (
      await db
        .select()
        .from(walletTopupRequests)
        .where(and(eq(walletTopupRequests.agencyId, agencyRow.id), eq(walletTopupRequests.status, status)))
        .limit(1)
    )[0];

  if (!(await decidedOf("REJECTED"))) {
    const open = (await pendingOf()) ??
      (await (
        await createTopupRequest({
          agencyId: agencyRow.id,
          amount: 90_000,
          note: "Funding for the March group file",
          actor: agencyActor,
        })
      ), await pendingOf())!;
    const target = (await pendingOf()) ?? open;
    if (target) {
      await processTopupRequest({
        requestId: target.id,
        actor: staffActor,
        decision: "REJECT",
        decisionNote: REJECT_REASON,
      });
      state.rejectedTopupId = target.id;
      state.rejectedTopupReason = REJECT_REASON;
    }
  } else {
    state.rejectedTopupReason = REJECT_REASON;
  }

  const stillPending = await pendingOf();
  if (stillPending) {
    state.pendingTopupId = stillPending.id;
  } else {
    const created = await createTopupRequest({
      agencyId: agencyRow.id,
      amount: 150_000,
      note: "Funding for the March group file",
      actor: agencyActor,
    });
    state.pendingTopupId = created.id;
  }

  state.generatedAt = new Date().toISOString();
  writeFileSync("/tmp/rendered-state.json", JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error("rendered-state failed:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
