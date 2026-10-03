import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import {
  createLegalDraft,
  getLegalVersion,
  getPublishedLegalVersion,
  publishLegalVersion,
  transitionLegalVersion,
  updateLegalDraft,
} from "@/lib/legal-content";
import { userByEmail } from "./helpers/fixtures";

describe("versioned legal content", () => {
  it("keeps drafts private and requires explicit approval before publication", async () => {
    const admin = await userByEmail("admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");

    const draft = await createLegalDraft({
      actor: admin,
      documentType: "privacy",
      language: "en",
      version: "privacy-test-v1",
      content: "Owner-provided test privacy text.",
      effectiveAt: "2026-10-01",
    });

    const activeBefore = await getPublishedLegalVersion("privacy", "en");
    expect(activeBefore?.id).not.toBe(draft.id);

    const ownerReview = await transitionLegalVersion({
      actor: admin,
      id: draft.id,
      nextStatus: "OWNER_REVIEW",
    });
    expect(ownerReview.status).toBe("OWNER_REVIEW");

    await expect(
      transitionLegalVersion({
        actor: admin,
        id: draft.id,
        nextStatus: "APPROVED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const legalReview = await transitionLegalVersion({
      actor: admin,
      id: draft.id,
      nextStatus: "LEGAL_REVIEW",
    });
    expect(legalReview.status).toBe("LEGAL_REVIEW");
    // Entering the queue is not fabricated evidence that a lawyer completed review.
    expect(legalReview.legalReviewedAt ?? null).toBeNull();

    const approved = await transitionLegalVersion({
      actor: superAdmin,
      id: draft.id,
      nextStatus: "APPROVED",
    });
    expect(approved.status).toBe("APPROVED");

    const published = await publishLegalVersion({ actor: superAdmin, id: draft.id });
    expect(published.status).toBe("PUBLISHED");
    expect(published.effectiveAt).toBe("2026-10-01T00:00:00.000Z");
    expect((await getPublishedLegalVersion("privacy", "en"))?.id).toBe(draft.id);

    await expect(
      updateLegalDraft({
        actor: superAdmin,
        id: draft.id,
        version: "should-not-edit",
        content: "Attempted in-place edit",
        effectiveAt: "2026-10-02",
      }),
    ).rejects.toMatchObject({ code: "IMMUTABLE" });
  });

  it("supersedes the previous live version without deleting history", async () => {
    const superAdmin = await userByEmail("superadmin@test.example");

    async function approveAndPublish(version: string, content: string) {
      const draft = await createLegalDraft({
        actor: superAdmin,
        documentType: "terms",
        language: "ar",
        version,
        content,
        effectiveAt: "2026-10-01",
      });
      await transitionLegalVersion({ actor: superAdmin, id: draft.id, nextStatus: "OWNER_REVIEW" });
      await transitionLegalVersion({ actor: superAdmin, id: draft.id, nextStatus: "APPROVED" });
      return publishLegalVersion({ actor: superAdmin, id: draft.id });
    }

    const first = await approveAndPublish("terms-ar-v1", "الشروط الأولى للاختبار");
    const second = await approveAndPublish("terms-ar-v2", "الشروط الثانية للاختبار");

    expect((await getPublishedLegalVersion("terms", "ar"))?.id).toBe(second.id);
    const historical = await getLegalVersion(first.id);
    expect(historical?.status).toBe("SUPERSEDED");
    expect(historical?.content).toBe("الشروط الأولى للاختبار");
    expect(second.supersedesId).toBe(first.id);
  });

  it("editing a reviewed draft resets review/approval state instead of silently publishing changes", async () => {
    const admin = await userByEmail("admin@test.example");
    const draft = await createLegalDraft({
      actor: admin,
      documentType: "terms",
      language: "fr",
      version: "terms-fr-draft",
      content: "Texte de travail fourni pour le test.",
    });
    await transitionLegalVersion({ actor: admin, id: draft.id, nextStatus: "OWNER_REVIEW" });

    const edited = await updateLegalDraft({
      actor: admin,
      id: draft.id,
      version: "terms-fr-draft-2",
      content: "Texte de travail modifié.",
      effectiveAt: null,
    });
    expect(edited.status).toBe("DRAFT");
    expect(edited.approvedAt ?? null).toBeNull();
    expect(edited.publishedAt ?? null).toBeNull();
    expect((await getPublishedLegalVersion("terms", "fr"))?.id).not.toBe(draft.id);
  });
});
