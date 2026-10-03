"use server";

/**
 * PUBLIC agency registration action.
 *
 * This endpoint is intentionally unauthenticated. Every defense lives
 * server-side: locale resolution, honeypot + render-time anti-automation
 * traps, strict whitelisted input (mass-assignment protection), localized
 * zod validation, server-side file type/content/size checks, rate limiting
 * and duplicate detection (in the service). The request can NEVER set role,
 * permissions, agency ID, approval status, wallet balance, credit or
 * internal notes — those fields do not exist in the input model.
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
import { AppError } from "@/lib/types";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";


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
    case "FILE_TOO_LARGE":
      return errors.fileTooLarge;
    case "FILE_TYPE":
    case "FILE_TOO_MANY":
    case "FILE_DUPLICATE":
      return errors.fileType;
    case "FILE_CONTENT":
      return errors.fileContent;
    case "FILE_NAME":
      return errors.fileName;
    default:
      return errors.generic;
  }
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
    // outside a request scope (tests) — IP-based heuristics degrade gracefully
  }
  const ip = hdrs ? clientIp(hdrs) : null;

  // Anti-automation 1 — honeypot: invisible to humans, filled by bots.
  // Silently "accepted" so bots learn nothing; nothing is persisted.
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

  // Anti-automation 2 — render-time trap: a real partnership request takes a moment.
  const renderedAt = Number(formData.get("renderedAt"));
  if (Number.isFinite(renderedAt) && renderedAt > 0 && Date.now() - renderedAt < 1500) {
    return { error: copy.errors.tooFast };
  }

  // Strict whitelisted input — privileged keys simply do not exist here.
  const schema = registrationFormSchema(copy.errors);
  const parsed = schema.safeParse({
    legalName: field(formData, "legalName"),
    contactFirstName: field(formData, "contactFirstName"),
    city: field(formData, "city"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    terms: field(formData, "terms"),
    privacy: field(formData, "privacy"),
    accuracy: field(formData, "accuracy"),
  });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { error: Object.values(fieldErrors)[0] ?? copy.errors.required, fieldErrors };
  }

  // Administrative files are accepted only through a scoped Staff-issued follow-up link.

  let reference: string;
  try {
    const [terms, privacy] = await Promise.all([readPublishedLegal("terms",locale),readPublishedLegal("privacy",locale)]);
    if (!terms || !privacy) return {error:publicBrandCopy(locale).legalMissing};
    const acceptedTermsId = field(formData, "termsVersionId");
    const acknowledgedPrivacyId = field(formData, "privacyVersionId");
    if (
      Number(field(formData, "termsVersion")) !== terms.version ||
      Number(field(formData, "privacyVersion")) !== privacy.version ||
      acceptedTermsId !== terms.id ||
      acknowledgedPrivacyId !== privacy.id
    ) {
      return { error: publicBrandCopy(locale).legalChanged };
    }
    const submitted = await submitAgencyRegistration({
      data: {
        ...parsed.data,
        locale,
        legalConsentVersions: {
          terms: {
            id: terms.id,
            version: terms.version,
            effectiveAt: terms.effectiveAt.toISOString(),
          },
          privacy: {
            id: privacy.id,
            version: privacy.version,
            effectiveAt: privacy.effectiveAt.toISOString(),
          },
          locale,
        },
      },
      files: [],
      ipAddress: ip,
    });
    reference = submitted.reference;

    await recordAudit({
      actor: null,
      action: "TERMS_ACCEPTED",
      entity: "agency_registration",
      entityId: submitted.id,
      metadata: {
        legalVersionId: terms.id,
        version: terms.version,
        locale,
        effectiveAt: terms.effectiveAt.toISOString(),
      },
      ipAddress: ip,
    });
    await recordAudit({
      actor: null,
      action: "PRIVACY_NOTICE_ACKNOWLEDGED",
      entity: "agency_registration",
      entityId: submitted.id,
      metadata: {
        legalVersionId: privacy.id,
        version: privacy.version,
        locale,
        effectiveAt: privacy.effectiveAt.toISOString(),
      },
      ipAddress: ip,
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
