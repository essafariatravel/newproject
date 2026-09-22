import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions } from "@/lib/queries";
import { listRequirementsForVisaType } from "@/lib/requests";
import { listPriorities } from "@/lib/applications";
import { getBalance } from "@/lib/wallet";
import { PageHeader } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { NATIONALITIES, DEFAULT_NATIONALITY, nationalityLabel } from "@/lib/nationalities";
import { RequestWizard, type WizardCountry, type WizardLabels, type WizardRequirement } from "./request-wizard";

export const dynamic = "force-dynamic";

/**
 * Phase 2-Final — exactly THREE user-facing steps:
 *   1. CHOOSE VISA — country-first, then visa-type cards; single applicant
 *      (Full Name + Nationality only)
 *   2. UPLOAD DOCUMENTS (from the visa-type requirement configuration)
 *   3. PREVIEW, CONFIRM & SUBMIT (one atomic server transaction)
 * Nothing is persisted before step 3 — no abandoned records, no early
 * reference allocation, no wallet interaction until the single final charge.
 */
export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await portalPageUser();
  const locale = await getUiLocale(sp);
  const ct = contentT(locale);

  const [visaOptions, priorities, wallet] = await Promise.all([
    activeVisaOptions(),
    listPriorities(true),
    getBalance(user.agencyId),
  ]);

  // Correction 3: group ACTIVE visa types under their ACTIVE destination
  // country; a country appears only when it has at least one active type.
  const countries: WizardCountry[] = [];
  for (const v of visaOptions) {
    let c = countries.find((x) => x.id === v.countryId);
    if (!c) {
      c = { id: v.countryId, name: v.countryName, visaTypes: [] };
      countries.push(c);
    }
    c.visaTypes.push({
      id: v.id,
      countryId: v.countryId,
      name: v.name,
      categoryName: v.categoryName,
      fee: v.fee,
      currency: v.currency,
      minDays: v.minDays,
      maxDays: v.maxDays,
    });
  }

  const requirementMaps: Record<string, WizardRequirement[]> = {};
  await Promise.all(
    visaOptions.map(async (v) => {
      requirementMaps[v.id] = await listRequirementsForVisaType(v.id);
    }),
  );

  const errorCode = typeof sp.error === "string" ? sp.error : null;
  const serverError = errorCode
    ? ct(`request.error.${errorCode}`) === `request.error.${errorCode}`
      ? ct("request.error.INTERNAL")
      : ct(`request.error.${errorCode}`)
    : null;

  const labels: WizardLabels = {
    stepChoose: ct("step.choose"),
    stepUpload: ct("step.upload"),
    stepPreview: ct("step.preview"),
    chooseCountry: ct("Choose country"),
    selectCountry: ct("Select the destination country first."),
    chooseVisa: ct("Choose visa type"),
    selectVisa: ct("Pick a country to see its visa types."),
    fee: ct("Fee"),
    processing: ct("Processing time"),
    days: ct("days"),
    priority: ct("Priority"),
    notes: ct("Notes for ESSAFARIA (optional)"),
    notesPlaceholder: ct("Travel dates, group context, special requests…"),
    applicant: ct("Applicant"),
    fullName: ct("Full name"),
    nationality: ct("Nationality"),
    next: ct("Next"),
    back: ct("Back"),
    required: ct("Required"),
    optional: ct("Optional"),
    uploadHint: ct("PDF, JPEG, PNG, WEBP, DOC or DOCX · maximum 2 MB per file"),
    fileTooLarge: ct("Files must be 2 MB or smaller."),
    chooseFile: ct("Choose file"),
    documents: ct("Upload the required documents"),
    reviewTitle: ct("Preview & confirm"),
    reviewSubtitle: ct("Verify everything below before submitting. This is the only write: your application is created, charged and sent to ESSAFARIA in one step."),
    walletBalance: ct("Wallet balance"),
    chargeNote: ct("Your wallet is charged once, automatically, when you confirm. Retrying a failed attempt can never charge twice."),
    confirmSubmit: ct("Confirm & submit"),
    submitting: ct("Submitting…"),
    missingPrefix: ct("Required documents missing"),
    summaryApplicant: ct("Applicant"),
    summaryDocuments: ct("Documents attached"),
    noDocumentsRequired: ct("This visa programme has no document requirements."),
    validationChooseCountry: ct("Choose a destination country to continue."),
    validationChooseVisa: ct("Choose a visa type to continue."),
    validationApplicant: ct("Enter the applicant's full name and choose a nationality."),
    searchNationality: ct("Choose nationality"),
  };

  const uiLocale = locale === "ar" ? "ar" : locale === "fr" ? "fr" : "en";

  return (
    <>
      <PageHeader
        title={ct("New visa request")}
        subtitle={ct("Three steps: choose the country and visa, upload the documents, preview and submit. Nothing is saved before the final confirmation.")}
      />
      <RequestWizard
        countries={countries}
        nationalities={NATIONALITIES.map((n) => ({ code: n.code, label: nationalityLabel(n.code, uiLocale) }))}
        defaultNationality={DEFAULT_NATIONALITY}
        priorities={priorities.map((p) => ({ code: p.code, name: p.name }))}
        requirementsByVisaType={requirementMaps}
        walletBalance={wallet.balance}
        walletCurrency={wallet.currency}
        locale={uiLocale}
        labels={labels}
        serverError={serverError}
      />
    </>
  );
}
