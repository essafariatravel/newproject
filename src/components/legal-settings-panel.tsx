import {
  publishLegalVersionAction,
  saveLegalDraftAction,
  transitionLegalVersionAction,
} from "@/app/actions/legal";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader } from "@/components/ui";
import {
  type LegalDocumentType,
  type LegalDocumentVersion,
  listLegalVersions,
} from "@/lib/legal-content";
import { getSiteSettings, settingString } from "@/lib/settings";
import type { Role } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";

const LANGUAGES: Array<[UiLocale, string]> = [
  ["en", "English"],
  ["fr", "Français"],
  ["ar", "العربية"],
];

const DOCUMENTS: Array<[LegalDocumentType, string]> = [
  ["privacy", "Privacy Notice"],
  ["terms", "Terms of Service"],
];

function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function latestEditable(
  versions: LegalDocumentVersion[],
  documentType: LegalDocumentType,
  language: UiLocale,
): LegalDocumentVersion | null {
  return (
    versions.find(
      (v) =>
        v.documentType === documentType &&
        v.language === language &&
        v.status !== "PUBLISHED" &&
        v.status !== "SUPERSEDED",
    ) ?? null
  );
}

function published(
  versions: LegalDocumentVersion[],
  documentType: LegalDocumentType,
  language: UiLocale,
): LegalDocumentVersion | null {
  return (
    versions.find(
      (v) => v.documentType === documentType && v.language === language && v.status === "PUBLISHED",
    ) ?? null
  );
}

function LegacyNotice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
      Legacy legal text exists in site settings. It is <strong>not published</strong> by the versioned
      workflow. Review it, assign an approved version/effective date, then publish explicitly.
    </p>
  );
}

function WorkflowControls({
  version,
  role,
}: {
  version: LegalDocumentVersion;
  role: Role;
}) {
  const canApprovePublish = role === "SUPER_ADMIN";
  const transition = (nextStatus: "DRAFT" | "OWNER_REVIEW" | "LEGAL_REVIEW" | "APPROVED", label: string) => (
    <form action={transitionLegalVersionAction}>
      <input type="hidden" name="id" value={version.id} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Updating…">
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {version.status === "DRAFT" ? transition("OWNER_REVIEW", "Send to owner review") : null}
      {version.status === "OWNER_REVIEW" ? transition("DRAFT", "Return to draft") : null}
      {version.status === "OWNER_REVIEW" ? transition("LEGAL_REVIEW", "Mark for legal review") : null}
      {version.status === "OWNER_REVIEW" && canApprovePublish
        ? transition("APPROVED", "Owner approve")
        : null}
      {version.status === "LEGAL_REVIEW" ? transition("DRAFT", "Return to draft") : null}
      {version.status === "LEGAL_REVIEW" && canApprovePublish
        ? transition("APPROVED", "Approve after legal review")
        : null}
      {version.status === "APPROVED" ? transition("DRAFT", "Reopen draft") : null}
      {version.status === "APPROVED" && canApprovePublish ? (
        <form action={publishLegalVersionAction}>
          <input type="hidden" name="id" value={version.id} />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Publishing…">
            Publish approved version
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

export async function LegalSettingsPanel({ role }: { role: Role }) {
  const [versions, settings] = await Promise.all([listLegalVersions(), getSiteSettings()]);

  return (
    <Card>
      <CardHeader
        title="Legal content — controlled publication"
        subtitle="Drafts never become public automatically. Published versions are immutable; changing legal text creates a new version."
      />
      <div className="space-y-8 px-5 py-5">
        {DOCUMENTS.map(([documentType, documentLabel]) => (
          <section key={documentType} className="space-y-4">
            <div>
              <h3 className="font-serif text-lg text-navy-900">{documentLabel}</h3>
              <p className="mt-1 text-xs text-slate-500">
                EN / FR / AR are independent approved artifacts. A missing locale stays unavailable.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {LANGUAGES.map(([language, languageLabel]) => {
                const live = published(versions, documentType, language);
                const editable = latestEditable(versions, documentType, language);
                const legacy =
                  settingString(settings, `legal.${documentType}.${language}`) ||
                  settingString(settings, `legal.${documentType}`);
                const initialContent = editable?.content ?? live?.content ?? legacy;
                const status = editable?.status ?? (live ? "PUBLISHED" : "NOT PUBLISHED");

                return (
                  <div key={language} className="space-y-3 rounded-xl border border-ivory-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {languageLabel}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">Status: {status}</p>
                      </div>
                      {live ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                          LIVE · {live.version}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                          NOT LIVE
                        </span>
                      )}
                    </div>

                    {!editable ? <LegacyNotice text={!live ? legacy : ""} /> : null}

                    {live ? (
                      <div className="rounded-lg bg-ivory-50 px-3 py-2 text-xs text-slate-600">
                        <p>Published version: <strong>{live.version}</strong></p>
                        <p>Effective: {live.effectiveAt ? live.effectiveAt.slice(0, 10) : "—"}</p>
                        <p>Published: {live.publishedAt ? live.publishedAt.slice(0, 10) : "—"}</p>
                      </div>
                    ) : null}

                    <form action={saveLegalDraftAction} className="space-y-3">
                      <input type="hidden" name="documentType" value={documentType} />
                      <input type="hidden" name="language" value={language} />
                      {editable ? <input type="hidden" name="id" value={editable.id} /> : null}

                      <div>
                        <label className="label" htmlFor={`legal-version-${documentType}-${language}`}>
                          Version identifier
                        </label>
                        <input
                          id={`legal-version-${documentType}-${language}`}
                          name="version"
                          required
                          maxLength={80}
                          defaultValue={editable?.version ?? ""}
                          placeholder="Owner/legal supplied, e.g. 2026-01"
                          className="input"
                        />
                      </div>

                      <div>
                        <label className="label" htmlFor={`legal-effective-${documentType}-${language}`}>
                          Approved effective date
                        </label>
                        <input
                          id={`legal-effective-${documentType}-${language}`}
                          name="effectiveAt"
                          type="date"
                          defaultValue={dateInput(editable?.effectiveAt)}
                          className="input"
                        />
                      </div>

                      <div>
                        <label className="label" htmlFor={`legal-content-${documentType}-${language}`}>
                          Approved text / draft
                        </label>
                        <textarea
                          id={`legal-content-${documentType}-${language}`}
                          name="content"
                          required
                          rows={12}
                          dir={language === "ar" ? "rtl" : undefined}
                          defaultValue={initialContent}
                          className="input"
                        />
                      </div>

                      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving draft…">
                        {editable ? "Save as draft (resets review)" : "Create draft"}
                      </SubmitButton>
                    </form>

                    {editable ? <WorkflowControls version={editable} role={role} /> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
