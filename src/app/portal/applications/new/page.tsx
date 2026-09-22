import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions } from "@/lib/queries";
import { listPriorities } from "@/lib/applications";
import { getBalance } from "@/lib/wallet";
import { PageHeader } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { listRequirementsForVisaType } from "@/lib/requests";
import { RequestWizard, type WizardLabels, type WizardRequirement } from "./request-wizard";

export const dynamic = "force-dynamic";

/**
 * Phase 2.3 §5–§12 — exactly THREE user-facing steps:
 *   1. Choose visa (traveller info inline)
 *   2. Upload documents (generated from the visa-type requirement config)
 *   3. Preview, confirm & submit (one atomic server transaction)
 * No draft rows exist before step 3 — no abandoned records, no early
 * reference allocation, no wallet interaction until the single final charge.
 */
export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await portalPageUser();
  const locale = await getUiLocale();
  const ct = contentT(locale);

  const [visaOptions, priorities, wallet] = await Promise.all([
    activeVisaOptions(),
    listPriorities(true),
    getBalance(user.agencyId),
  ]);

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
    visaProgramme: ct("Visa programme"),
    selectVisa: ct("Select one visa programme to continue."),
    noVisaSelected: ct("No visa selected yet."),
    fee: ct("Fee"),
    processing: ct("Processing time"),
    days: ct("days"),
    priority: ct("Priority"),
    notes: ct("Notes for ESSAFARIA (optional)"),
    notesPlaceholder: ct("Travel dates, group context, special requests…"),
    travellers: ct("Travellers"),
    traveller: ct("Traveller"),
    addTraveller: ct("Add another traveller"),
    removeTraveller: ct("Remove"),
    firstName: ct("First name"),
    lastName: ct("Last name"),
    dateOfBirth: ct("Date of birth"),
    nationality: ct("Nationality"),
    passportNumber: ct("Passport number"),
    passportIssueDate: ct("Passport issue date"),
    passportExpiryDate: ct("Passport expiry"),
    email: ct("Email (optional)"),
    phone: ct("Phone (optional)"),
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
    summaryTravellers: ct("Travellers (checked above)"),
    summaryDocuments: ct("Documents attached"),
    noDocumentsRequired: ct("This visa programme has no document requirements."),
    validationChooseVisa: ct("Choose a visa programme to continue."),
    validationTraveller: ct("Complete every required traveller field to continue."),
  };

  return (
    <>
      <PageHeader
        title={ct("New visa request")}
        subtitle={ct("Three steps: choose the visa, upload the documents, preview and submit. Nothing is saved before the final confirmation.")}
      />
      <RequestWizard
        visaOptions={visaOptions.map((v) => ({
          id: v.id,
          label: v.label,
          name: v.name,
          countryName: v.countryName,
          categoryName: v.categoryName,
          fee: v.fee,
          currency: v.currency,
          minDays: v.minDays,
          maxDays: v.maxDays,
        }))}
        priorities={priorities.map((p) => ({ code: p.code, name: p.name }))}
        requirementsByVisaType={requirementMaps}
        walletBalance={wallet.balance}
        walletCurrency={wallet.currency}
        locale={locale}
        labels={labels}
        serverError={serverError}
      />
    </>
  );
}
