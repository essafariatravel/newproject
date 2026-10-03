"use server";

/**
 * PUBLIC agency registration action.
 *
 * First contact is deliberately minimal: no KYC documents, tax records,
 * licence uploads, full postal address or procurement-style questionnaire.
 * Administrative evidence is requested later by authorized Staff when there
 * is an actual need. Every accepted scalar is explicitly whitelisted.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { registrationCopy, resolveLocale, type RegistrationCopy } from "@/lib/i18n";
import {
  fieldErrorsFrom,
  registrationFormSchema,
  submitAgencyRegistration,
} from "@/lib/registrations";
import { verifyLegalVersionForAcceptance } from "@/lib/legal-content";
import { AppError } from "@/lib/types";

export interface RegistrationFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function clientIp(hdrs: Headers): string | null {
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip")?.trim() ??
    null
  );
}

/** Pull ONE whitelisted scalar field; never spread FormData into models. */
function field(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v !== "" ? v : undefined;
}

function localizedError(code: string, errors: RegistrationCopy["errors"]): string {
  switch (code) {
    case "DUPLICATE":
      return errors.duplicate;
    case "RATE_LIMITED":
      return errors.rateLimited;
    default:
      return errors.generic;
  }
}

function legalVersionChanged(locale: "en" | "fr" | "ar"): string {
  return {
    en: "The legal documents changed while this form was open. Refresh the page, review the current versions and submit again.",
    fr: "Les documents juridiques ont changé pendant que ce formulaire était ouvert. Actualisez la page, consultez les versions actuelles puis envoyez à nouveau votre demande.",
    ar: "تم تحديث المستندات القانونية أثناء فتح هذا النموذج. يرجى تحديث الصفحة ومراجعة الإصدارات الحالية ثم إعادة إرسال الطلب.",
  }[locale];
}

export async function submitRegistrationAction(
  _prev: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = registrationCopy(locale);
  let hdrs: Headers | null = null;
  try {
    hdrs = await headers();
  } catch {
    // Outside a request scope (tests) — IP-based abuse controls degrade gracefully.
  }
  const ip = hdrs ? clientIp(hdrs) : null;

  // Honeypot submissions are discarded; nothing is persisted.
  const honeypot = formData.get("fax");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    await recordAudit({
      actor: null,
      action: "AGENCY_REGISTRATION_SPAM",
      entity: "agency_registration",
      metadata: { trap: "honeypot" },
      ipAddress: ip,
    });
    redirect(`/agency/register/success?lang=${locale}`);
  }

  // A human request form normally takes more than a fraction of a second.
  const renderedAt = Number(formData.get("renderedAt"));
  if (Number.isFinite(renderedAt) && renderedAt > 0 && Date.now() - renderedAt < 1500) {
    return { error: copy.errors.tooFast };
  }

  const schema = registrationFormSchema(copy.errors);
  const parsed = schema.safeParse({
    legalName: field(formData, "legalName"),
    country: field(formData, "country"),
    region: field(formData, "region"),
    city: field(formData, "city"),
    contactFirstName: field(formData, "contactFirstName"),
    contactLastName: field(formData, "contactLastName"),
    contactEmail: field(formData, "contactEmail"),
    contactPhone: field(formData, "contactPhone"),
    businessType: field(formData, "businessType"),
    message: field(formData, "message"),
    termsVersionId: field(formData, "termsVersionId"),
    privacyVersionId: field(formData, "privacyVersionId"),
    terms: field(formData, "terms"),
    privacy: field(formData, "privacy"),
    accuracy: field(formData, "accuracy"),
  });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { error: Object.values(fieldErrors)[0] ?? copy.errors.required, fieldErrors };
  }

  // Never accept evidence against a stale/draft/other-language legal document.
  let termsVersion;
  let privacyVersion;
  try {
    [termsVersion, privacyVersion] = await Promise.all([
      verifyLegalVersionForAcceptance({
        documentType: "terms",
        language: locale,
        versionId: parsed.data.termsVersionId,
      }),
      verifyLegalVersionForAcceptance({
        documentType: "privacy",
        language: locale,
        versionId: parsed.data.privacyVersionId,
      }),
    ]);
  } catch {
    return { error: legalVersionChanged(locale) };
  }

  let reference: string;
  let registrationId: string;
  try {
    const submitted = await submitAgencyRegistration({
      data: { ...parsed.data, locale },
      // Administrative documents are intentionally not accepted at first contact.
      files: [],
      ipAddress: ip,
    });
    reference = submitted.reference;
    registrationId = submitted.id;

    // Terms acceptance and Privacy acknowledgement remain separate evidence.
    // No device fingerprint or extra IP copy is collected for these events.
    await recordAudit({
      actor: null,
      action: "TERMS_ACCEPTED",
      entity: "agency_registration",
      entityId: registrationId,
      metadata: {
        legalVersionId: termsVersion.id,
        version: termsVersion.version,
        language: locale,
      },
    });
    await recordAudit({
      actor: null,
      action: "PRIVACY_NOTICE_ACKNOWLEDGED",
      entity: "agency_registration",
      entityId: registrationId,
      metadata: {
        legalVersionId: privacyVersion.id,
        version: privacyVersion.version,
        language: locale,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return { error: localizedError(err.code, copy.errors) };
    }
    console.error("[registrations] submission failed", err);
    return { error: copy.errors.generic };
  }
  redirect(`/agency/register/success?ref=${encodeURIComponent(reference)}&lang=${locale}`);
}
