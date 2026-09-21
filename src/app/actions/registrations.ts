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
  validateRegistrationFile,
  type RegistrationFileInput,
} from "@/lib/registrations";
import { AppError } from "@/lib/types";
import { REGISTRATION_DOCUMENT_CATEGORIES } from "@/db/schema";

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

  // Anti-automation 2 — render-time trap: a real KYC form takes a moment.
  const renderedAt = Number(formData.get("renderedAt"));
  if (Number.isFinite(renderedAt) && renderedAt > 0 && Date.now() - renderedAt < 1500) {
    return { error: copy.errors.tooFast };
  }

  // Strict whitelisted input — privileged keys simply do not exist here.
  const schema = registrationFormSchema(copy.errors);
  const parsed = schema.safeParse({
    legalName: field(formData, "legalName"),
    tradingName: field(formData, "tradingName"),
    country: field(formData, "country"),
    region: field(formData, "region"),
    city: field(formData, "city"),
    addressLine: field(formData, "addressLine"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    website: field(formData, "website"),
    commercialRegistrationNumber: field(formData, "commercialRegistrationNumber"),
    taxId: field(formData, "taxId"),
    licenceNumber: field(formData, "licenceNumber"),
    contactFirstName: field(formData, "contactFirstName"),
    contactLastName: field(formData, "contactLastName"),
    contactPosition: field(formData, "contactPosition"),
    contactEmail: field(formData, "contactEmail"),
    contactPhone: field(formData, "contactPhone"),
    businessType: field(formData, "businessType"),
    monthlyVolume: field(formData, "monthlyVolume"),
    mainMarkets: field(formData, "mainMarkets"),
    message: field(formData, "message"),
    terms: field(formData, "terms"),
    privacy: field(formData, "privacy"),
    accuracy: field(formData, "accuracy"),
  });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { error: Object.values(fieldErrors)[0] ?? copy.errors.required, fieldErrors };
  }

  // Optional company documents — validated (type, content, size) server-side.
  const files: RegistrationFileInput[] = [];
  for (const category of REGISTRATION_DOCUMENT_CATEGORIES) {
    const f = formData.get(`doc_${category}`);
    if (f instanceof File && f.size > 0) {
      const input: RegistrationFileInput = {
        category,
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        data: Buffer.from(await f.arrayBuffer()),
      };
      try {
        validateRegistrationFile(input);
      } catch (err) {
        const message =
          err instanceof AppError ? localizedError(err.code, copy.errors) : copy.errors.generic;
        return { error: message, fieldErrors: { [`doc_${category}`]: message } };
      }
      files.push(input);
    }
  }

  let reference: string;
  try {
    const submitted = await submitAgencyRegistration({
      data: { ...parsed.data, locale },
      files,
      ipAddress: ip,
    });
    reference = submitted.reference;
  } catch (err) {
    if (err instanceof AppError) {
      return { error: localizedError(err.code, copy.errors) };
    }
    console.error("[registrations] submission failed", err);
    return { error: copy.errors.generic };
  }
  redirect(`/agency/register/success?ref=${encodeURIComponent(reference)}&lang=${locale}`);
}
