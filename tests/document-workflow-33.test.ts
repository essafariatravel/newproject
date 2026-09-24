import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import {
  applicants as applicantsTb,
  applications,
  auditLogs,
  checklistItems,
  documentRequests,
  documentTypes,
  documents,
  notifications,
} from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { createDraftApplication, getChecklist, getStatusByCode, submitApplication } from "@/lib/applications";
import { groupDocumentsForDisplay, listDocumentsForApplication, reviewDocument, uploadDocument } from "@/lib/documents";
import {
  listAgencyRequestableDocumentTypes,
  listDocumentRequests,
  requestAdditionalDocument,
  requestDocumentReplacement,
} from "@/lib/document-requests";
import { adjustWallet, findTransactionByApplication, getBalance } from "@/lib/wallet";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { AppError } from "@/lib/types";

/**
 * §11–§13 — post-submission document workflow, verified END TO END through the
 * real services (no source-text assertions).
 *
 * This suite exists because of a real product bug: after an agency uploaded a
 * requested replacement/additional document, the staff dossier did not show the
 * new version and the agency UI kept offering the upload action instead of
 * reporting the request as fulfilled. Every step below therefore asserts BOTH
 * sides of the workflow — the agency's view and the staff's view of the same
 * dossier — using the exact queries the pages use (`groupDocumentsForDisplay`,
 * `listDocumentsForApplication`, `listDocumentRequests`).
 */

const STAFF_EMAIL = "agent@test.example";

const FILE = (name: string, body = "%PDF-1.4 essafaria") => ({
  name,
  type: "application/pdf",
  size: body.length,
  data: Buffer.from(body),
});

async function visaId(code = "FR-SCH-TOUR") {
  return ((await db.execute(sql`select id from visa_types where code=${code}`)).rows[0] as { id: string }).id;
}

/** A submitted (non-draft) application owned by agency A with a funded wallet. */
async function submittedApplication(tag: string) {
  const agency = await agencyByEmail("ops@agencya.example");
  const staff = await userByEmail(STAFF_EMAIL);
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staff });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Amina",
    lastName: "Kaci",
    fullName: "Amina Kaci",
    dateOfBirth: "1990-04-12",
    nationality: "Algerian",
    passportNumber: `AB${String(Date.now()).slice(-6)}`,
    passportExpiryDate: "2032-06-30",
  });
  for (const item of await getChecklist(app.id)) {
    if (!item.required) continue;
    await uploadDocument({
      applicationId: app.id,
      actor: staff,
      checklistItemId: item.id,
      file: FILE(`${tag}-${item.documentTypeCode.toLowerCase()}.pdf`),
    });
    const uploaded = (await db.select().from(documents).where(and(eq(documents.applicationId, app.id), eq(documents.checklistItemId, item.id))))[0]!;
    await reviewDocument({ documentId: uploaded.id, actor: staff, status: "ACCEPTED" });
  }
  // Fund the wallet through the real primitive, then submit (single charge).
  await adjustWallet({ agencyId: agency.id, amount: 5000, reason: "doc workflow funding", actor: staff });
  await submitApplication({ applicationId: app.id, actor: staff });
  return { app, agency, staff };
}

/** Exactly what the dossier pages load: checklist + documents + requests, grouped for display. */
async function snapshot(applicationId: string) {
  const checklist = await getChecklist(applicationId);
  const docs = await listDocumentsForApplication(applicationId);
  const requests = await listDocumentRequests(applicationId);
  return { checklist, docs, requests, groups: groupDocumentsForDisplay(checklist, docs) };
}

describe("§11 document workflow — locking, replacement, additional, fulfilment", () => {
  it("1. submitted documents are locked: an agency upload without a staff request is refused", async () => {
    const { app, agency } = await submittedApplication("lock");
    const agencyAdmin = await userByEmail("a-admin@test.example");
    const item = (await getChecklist(app.id))[0]!;

    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: { ...agencyAdmin, agencyId: agency.id },
        checklistItemId: item.id,
        file: FILE("sneaky-extra-version.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });

    const versions = await db.select().from(documents).where(eq(documents.checklistItemId, item.id));
    expect(versions.length).toBe(1);
  });

  it("2. staff requests a replacement for ONE requirement; staff view shows the request as OPEN", async () => {
    const { app } = await submittedApplication("repl");
    const staff = await userByEmail(STAFF_EMAIL);
    const item = (await getChecklist(app.id))[0]!;

    const request = await requestDocumentReplacement({
      applicationId: app.id,
      checklistItemId: item.id,
      reason: "Photo page is blurred — please rescan.",
      actor: staff,
    });
    expect(request.type).toBe("REPLACEMENT");
    expect(request.status).toBe("OPEN");

    const staffView = await snapshot(app.id);
    const open = staffView.requests.filter((r) => r.req.status === "OPEN");
    expect(open.map((r) => r.req.id)).toEqual([request.id]);
    // …and the agency was notified with a deep link to the dossier.
    const notif = await db
      .select()
      .from(notifications)
      .where(eq(notifications.applicationId, app.id));
    expect(notif.some((n) => n.type === "DOCUMENT_REQUESTED" && n.link === `/portal/applications/${app.id}`)).toBe(true);
  });

  it("3. only the requested slot becomes uploadable — the other requirements stay locked", async () => {
    const { app, agency } = await submittedApplication("slot");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const items = await getChecklist(app.id);
    const requested = items[0]!;
    const untouched = items[1]!;

    await requestDocumentReplacement({
      applicationId: app.id,
      checklistItemId: requested.id,
      reason: "Signature missing on the form.",
      actor: staff,
    });

    // the requested slot uploads fine
    const replacement = await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: requested.id,
      file: FILE("replacement-v2.pdf"),
    });
    expect(replacement.version).toBe(2);

    // any other slot is still refused
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: agencyAdmin,
        checklistItemId: untouched.id,
        file: FILE("other-slot.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
  });

  it("4. after the agency uploads, the request is FULFILLED and the slot locks again immediately", async () => {
    const { app, agency } = await submittedApplication("fulfil");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const item = (await getChecklist(app.id))[0]!;

    const request = await requestDocumentReplacement({
      applicationId: app.id,
      checklistItemId: item.id,
      reason: "Please upload the newer bank statement.",
      actor: staff,
    });
    const uploaded = await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: item.id,
      file: FILE("bank-statement-v2.pdf"),
    });

    const rows = await db.select().from(documentRequests).where(eq(documentRequests.id, request.id));
    expect(rows[0]!.status).toBe("FULFILLED");
    expect(rows[0]!.fulfilledDocumentId).toBe(uploaded.id);
    expect(rows[0]!.fulfilledAt).toBeTruthy();

    // The agency view no longer offers the upload action: no OPEN request remains.
    const agencyView = await snapshot(app.id);
    expect(agencyView.requests.filter((r) => r.req.status === "OPEN").length).toBe(0);
    expect(agencyView.requests.find((r) => r.req.id === request.id)!.req.status).toBe("FULFILLED");

    // …and a further upload of the same slot is refused without a NEW request.
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: agencyAdmin,
        checklistItemId: item.id,
        file: FILE("bank-statement-v3.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
  });

  it("5. staff can see AND preview the newly uploaded version (the reported bug)", async () => {
    const { app, agency } = await submittedApplication("visible");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const item = (await getChecklist(app.id))[0]!;

    await requestDocumentReplacement({
      applicationId: app.id,
      checklistItemId: item.id,
      reason: "The scan is cropped — resend the full page.",
      actor: staff,
    });
    const uploaded = await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: item.id,
      file: FILE("replacement-visible.pdf"),
    });

    // STAFF VIEW: the new version is inside the checklist group the page renders.
    const staffView = await snapshot(app.id);
    const group = staffView.groups.byItem.get(item.id) ?? [];
    expect(group.length).toBe(2);
    expect(group[0]!.doc.id).toBe(uploaded.id); // newest version first
    expect(group[0]!.doc.version).toBe(2);
    expect(group[0]!.doc.status).toBe("UPLOADED");
    expect(group[0]!.doc.originalFilename).toBe("replacement-visible.pdf");
    // Nothing was pushed into the "not linked" bucket: it must be attached to its requirement.
    expect(staffView.groups.unassigned.length).toBe(0);
    // The preview/download path accepts the new document for staff.
    const { getDocumentForUser } = await import("@/lib/documents");
    const staffRead = await getDocumentForUser(uploaded.id, staff);
    expect(staffRead.doc.id).toBe(uploaded.id);

    // AGENCY VIEW: identical grouping, and the request reads as received.
    const agencyView = await snapshot(app.id);
    expect((agencyView.groups.byItem.get(item.id) ?? []).length).toBe(2);
    expect(agencyView.requests.find((r) => r.req.fulfilledDocumentId === uploaded.id)!.req.status).toBe("FULFILLED");
  });

  it("6. v1 is never overwritten and the version history survives — with an immutable audit trail", async () => {
    const { app, agency } = await submittedApplication("history");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const item = (await getChecklist(app.id))[0]!;

    const before = await db.select().from(documents).where(eq(documents.checklistItemId, item.id));
    const v1 = before[0]!;
    const v1Copy = { ...v1 };

    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, reason: "Resend, please.", actor: staff });
    const v2 = await uploadDocument({ applicationId: app.id, actor: agencyAdmin, checklistItemId: item.id, file: FILE("v2.pdf") });

    const after = await db.select().from(documents).where(eq(documents.checklistItemId, item.id));
    expect(after.length).toBe(2);
    const storedV1 = after.find((d) => d.id === v1.id)!;
    expect(storedV1.storageKey).toBe(v1Copy.storageKey);
    expect(storedV1.originalFilename).toBe(v1Copy.originalFilename);
    expect(storedV1.version).toBe(1);
    expect(v2.version).toBe(2);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, v2.id));
    expect(audits.some((a) => a.action === "DOCUMENT_UPLOADED")).toBe(true);
    const reqAudits = await db.select().from(auditLogs).where(eq(auditLogs.action, "DOCUMENT_REPLACEMENT_REQUESTED"));
    expect(reqAudits.length).toBeGreaterThan(0);
  });
});

describe("§11 document workflow — additional documents", () => {
  it("7. an additional request creates exactly one new slot; only that slot opens", async () => {
    const { app, agency } = await submittedApplication("add");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const before = await getChecklist(app.id);
    const { documentTypeIdByCode } = await import("./helpers/fixtures");
    const extraType = await documentTypeIdByCode("HOTEL_RESERVATION");

    const request = await requestAdditionalDocument({
      applicationId: app.id,
      documentTypeId: extraType,
      reason: "Embassy requires the last three months of statements.",
      actor: staff,
    });
    expect(request.type).toBe("ADDITIONAL");
    expect(request.checklistItemId).toBeTruthy();

    const after = await getChecklist(app.id);
    expect(after.length).toBe(before.length + 1); // one new slot, nothing else changed
    const newItem = after.find((i) => i.id === request.checklistItemId)!;
    expect(newItem.documentTypeId).toBe(extraType);
    expect(newItem.required).toBe(true); // an embassy-driven addition is not optional

    // the new slot accepts the upload…
    const uploaded = await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: newItem.id,
      documentTypeId: extraType,
      file: FILE("statements-3-months.pdf"),
    });
    expect(uploaded.version).toBe(1);

    // …every pre-existing slot stays locked
    for (const item of before) {
      await expect(
        uploadDocument({
          applicationId: app.id,
          actor: agencyAdmin,
          checklistItemId: item.id,
          file: FILE(`should-fail-${item.id.slice(0, 6)}.pdf`),
        }),
      ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
    }
  });

  it("8. after the additional document is sent, its slot locks immediately and staff see it", async () => {
    const { app, agency } = await submittedApplication("add2");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const { documentTypeIdByCode } = await import("./helpers/fixtures");
    const extraType = await documentTypeIdByCode("HOTEL_RESERVATION");

    const request = await requestAdditionalDocument({
      applicationId: app.id,
      documentTypeId: extraType,
      reason: "Proof of funds for the last quarter.",
      actor: staff,
    });
    const uploaded = await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: request.checklistItemId!,
      documentTypeId: extraType,
      file: FILE("funds.pdf"),
    });

    const staffView = await snapshot(app.id);
    const group = staffView.groups.byItem.get(request.checklistItemId!) ?? [];
    expect(group.map((g) => g.doc.id)).toEqual([uploaded.id]); // brand-new slot: exactly one version
    expect(staffView.groups.unassigned.length).toBe(0);

    const agencyView = await snapshot(app.id);
    expect(agencyView.requests.filter((r) => r.req.status === "OPEN").length).toBe(0);
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: agencyAdmin,
        checklistItemId: request.checklistItemId!,
        documentTypeId: extraType,
        file: FILE("funds-v2.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
  });

  it("9. a document that is not linked to any requirement is still visible in both views", async () => {
    // Guard for the shape of the reported bug: a stored document must never be
    // invisible just because its checklist link is missing/removed.
    const { app, agency } = await submittedApplication("orphan");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const { documentTypeIdByCode } = await import("./helpers/fixtures");
    const orphanType = await documentTypeIdByCode("PHOTO");

    // The agency cannot add unrequested documents post-submission…
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: agencyAdmin,
        documentTypeId: orphanType,
        applicantId: null,
        file: FILE("orphan-photo.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });

    // …but a staff capture without a checklist link must not become invisible.
    const staffUpload = await uploadDocument({
      applicationId: app.id,
      actor: staff,
      documentTypeId: orphanType,
      file: FILE("staff-capture.pdf"),
    });

    const staffView = await snapshot(app.id);
    const visibleIds = [
      ...staffView.docs.map((d) => d.doc.id),
      ...staffView.groups.unassigned.map((u) => u.doc.id),
    ];
    expect(visibleIds).toContain(staffUpload.id);
    expect(staffView.groups.unassigned.map((u) => u.doc.id)).toContain(staffUpload.id);

    const agencyView = await snapshot(app.id);
    expect(agencyView.groups.unassigned.map((u) => u.doc.id)).toContain(staffUpload.id);
  });
});

describe("§11 document workflow — cross-tenant abuse", () => {
  it("10. agency B can neither upload into nor read/download agency A's documents", async () => {
    const { app } = await submittedApplication("tenant");
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const bAdmin = { ...(await userByEmail("b-admin@test.example")), agencyId: agencyB.id };
    const bAdminReal = await userByEmail("b-admin@test.example");
    const item = (await getChecklist(app.id))[0]!;
    const doc = (await db.select().from(documents).where(eq(documents.checklistItemId, item.id)))[0]!;

    // 1) upload into another tenant's dossier
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: bAdmin,
        checklistItemId: item.id,
        file: FILE("cross-tenant.pdf"),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // 2) read metadata / download the document
    const { getDocumentForUser } = await import("@/lib/documents");
    await expect(getDocumentForUser(doc.id, bAdminReal)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // 3) an agency actor can never staff-request documents — not on its own dossier,
    //    and not on another tenant's (the role gate fires before anything is read).
    await expect(
      requestDocumentReplacement({
        applicationId: app.id,
        checklistItemId: item.id,
        reason: "cross tenant attempt",
        actor: bAdminReal,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const aAdmin = await userByEmail("a-admin@test.example");
    await expect(
      requestDocumentReplacement({
        applicationId: app.id,
        checklistItemId: item.id,
        reason: "agency pretending to be staff",
        actor: aAdmin,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // 4) the dossier loader every document page calls refuses the other tenant,
    //    which is what keeps listDocumentRequests/listDocumentsForApplication scoped.
    const { getApplicationDetail } = await import("@/lib/queries");
    await expect(getApplicationDetail(app.id, bAdminReal)).resolves.toBeNull();
    await expect(getApplicationDetail(app.id, aAdmin)).resolves.not.toBeNull();
  });

  it("11. a document request from another dossier cannot unlock this one", async () => {
    const a = await submittedApplication("handoff-a");
    const b = await submittedApplication("handoff-b");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyA = await agencyByEmail("ops@agencya.example");
    const aAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agencyA.id };
    const aItem = (await getChecklist(a.app.id))[0]!;
    const bItem = (await getChecklist(b.app.id))[0]!;

    await requestDocumentReplacement({ applicationId: b.app.id, checklistItemId: bItem.id, reason: "only for B", actor: staff });

    await expect(
      uploadDocument({
        applicationId: a.app.id,
        actor: aAdmin,
        checklistItemId: aItem.id,
        file: FILE("wrong-dossier.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
  });
});

describe("§11 document workflow — review after fulfilment", () => {
  it("12. staff can accept the uploaded replacement and the status is persisted", async () => {
    const { app, agency } = await submittedApplication("review");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const item = (await getChecklist(app.id))[0]!;

    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, reason: "Resend the document.", actor: staff });
    const uploaded = await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: item.id,
      file: FILE("to-review.pdf"),
    });
    await reviewDocument({ documentId: uploaded.id, actor: staff, status: "ACCEPTED" });

    const docs = await db.select().from(documents).where(eq(documents.id, uploaded.id));
    expect(docs[0]!.status).toBe("ACCEPTED");
    expect(docs[0]!.reviewedBy).toBe(staff.id);

    // an agency user can never review its own upload
    await expect(reviewDocument({ documentId: uploaded.id, actor: agencyAdmin, status: "ACCEPTED" })).rejects.toBeInstanceOf(AppError);
  });

  it("13. a replaced (superseded) file stays downloadable for staff — history, not overwrite", async () => {
    const { app, agency } = await submittedApplication("archive");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const item = (await getChecklist(app.id))[0]!;
    const v1 = (await db.select().from(documents).where(eq(documents.checklistItemId, item.id)))[0]!;

    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, reason: "Please resend.", actor: staff });
    await uploadDocument({ applicationId: app.id, actor: agencyAdmin, checklistItemId: item.id, file: FILE("v2.pdf") });

    const { getDocumentForUser } = await import("@/lib/documents");
    const v1Row = await getDocumentForUser(v1.id, staff);
    expect(v1Row.doc.status).toBe("ACCEPTED");
    expect(v1Row.doc.version).toBe(1);

    const all = await db.select().from(documents).where(eq(documents.checklistItemId, item.id)).orderBy(asc(documents.version));
    expect(all.map((d) => d.version)).toEqual([1, 2]);
  });

  it("14. the dossier keeps a single charge: document traffic never touches the wallet", async () => {
    const { app, agency } = await submittedApplication("nowallet");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const items = await getChecklist(app.id);

    const before = await findTransactionByApplication(app.id);
    const balanceBefore = await getBalance(agency.id);
    const agencyRow = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(agencyRow[0]!.agencyId).toBe(agency.id);

    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: items[0]!.id, reason: "One more resend.", actor: staff });
    await uploadDocument({ applicationId: app.id, actor: agencyAdmin, checklistItemId: items[0]!.id, file: FILE("extra.pdf") });
    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: items[1]!.id, reason: "And this one too.", actor: staff });
    await uploadDocument({ applicationId: app.id, actor: agencyAdmin, checklistItemId: items[1]!.id, file: FILE("extra2.pdf") });

    const after = await findTransactionByApplication(app.id);
    expect(after?.id).toBe(before?.id);
    // …and the balance did not move either (no debit, no credit, no adjustment).
    expect((await getBalance(agency.id)).balance).toBe(balanceBefore.balance);
  });

  it("15. terminal files stay locked: an approved dossier accepts no agency upload at all", async () => {
    const { app, agency } = await submittedApplication("terminal");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const item = (await getChecklist(app.id))[0]!;

    // Reach a terminal state only the way the product allows it: via the decision
    // panel with its mandatory decision document.
    const { changeApplicationStatus, recordApplicationDecision } = await import("@/lib/applications");
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "IN_PROCESS", actor: staff });
    const decision = await recordApplicationDecision({
      applicationId: app.id,
      outcome: "REJECTED",
      actor: staff,
      file: { name: "refusal-letter.pdf", type: "application/pdf", size: 32, data: Buffer.from("%PDF-1.7 refusal letter stub....") },
    });
    expect(decision.statusCode).toBe("REJECTED");

    // a staff request after the close must not reopen the file for the agency
    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, reason: "staff attempt after close", actor: staff }).catch(() => undefined);

    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: agencyAdmin,
        checklistItemId: item.id,
        file: FILE("after-close.pdf"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });

    const finalStatus = await getStatusByCode("REJECTED");
    const statuses = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(statuses[0]!.statusId).toBe(finalStatus.id);
  });

/**
 * §"ADDITIONAL from configured types" — the catalogue says WHO provides a
 * document. Decision artifacts (issued visa, refusal letter) are produced by
 * ESSAFARIA / the authority; asking an agency to upload one is nonsense and was
 * a real defect found by the rendered audit (staff could request the authority's
 * own decision document from the agency).
 */
describe("document types — agency-provided vs ESSAFARIA-issued", () => {
  it("16. only agency-provided types are offered as additional documents", async () => {
    const types = await listAgencyRequestableDocumentTypes();
    expect(types.length).toBeGreaterThan(5);
    expect(types.some((t) => t.code.startsWith("DECISION_"))).toBe(false);
    expect(types.some((t) => t.code === "PASSPORT")).toBe(true);
  });

  it("17. staff cannot request a decision document from an agency", async () => {
    const { app } = await submittedApplication("decision-type");
    const staff = await userByEmail(STAFF_EMAIL);
    const decisionType = (
      await db.select().from(documentTypes).where(eq(documentTypes.code, "DECISION_VISA_APPROVAL")).limit(1)
    )[0]!;
    expect(decisionType.agencyUploadable).toBe(false);

    await expect(
      requestAdditionalDocument({
        applicationId: app.id,
        documentTypeId: decisionType.id,
        reason: "Please provide the decision letter",
        actor: staff,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // …and no phantom requirement was created for the agency.
    const items = await getChecklist(app.id);
    expect(items.some((i) => i.documentTypeId === decisionType.id)).toBe(false);
  });

  it("18. an agency can never upload into an ESSAFARIA-issued slot, even with an open request", async () => {
    const { app, agency } = await submittedApplication("issued-upload");
    const staff = await userByEmail(STAFF_EMAIL);
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const decisionType = (
      await db.select().from(documentTypes).where(eq(documentTypes.code, "DECISION_REFUSAL_LETTER")).limit(1)
    )[0]!;

    // Simulate a legacy/hostile row: a checklist item + an OPEN request whose
    // type is staff-issued. The upload path must still refuse it.
    const inserted = await db
      .insert(checklistItems)
      .values({
        applicationId: app.id,
        documentTypeId: decisionType.id,
        documentTypeName: decisionType.name,
        documentTypeCode: decisionType.code,
        required: true,
        sortOrder: 999,
        active: true,
      })
      .returning();
    const item = inserted[0]!;
    await db.insert(documentRequests).values({
      applicationId: app.id,
      checklistItemId: item.id,
      documentTypeId: decisionType.id,
      type: "ADDITIONAL",
      reason: "legacy open request",
      status: "OPEN",
      requestedBy: staff.id,
    });

    await expect(
      uploadDocument({ applicationId: app.id, actor: agencyAdmin, checklistItemId: item.id, file: FILE("decision.pdf") }),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });

    const rows = await db.select().from(documents).where(eq(documents.checklistItemId, item.id));
    expect(rows).toHaveLength(0);
  });
});
});
