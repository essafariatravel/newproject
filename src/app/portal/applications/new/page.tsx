import { configName, configDescription } from "@/lib/config-localization";
import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions } from "@/lib/queries";
import { listRequirementsForVisaType } from "@/lib/requests";
import { getBalance } from "@/lib/wallet";
import { PageHeader, EmptyState } from "@/components/ui";
import { getUiLocale, localizedDocTypeName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
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

  const load = await Promise.all([
    activeVisaOptions(),
    getBalance(user.agencyId),
  ]).catch(() => null);
  if (!load) return <div className="card"><EmptyState title={ct("Visa services are temporarily unavailable")} body={ct("Please try again. Your wallet has not been charged.")} action={<a href="/portal/applications/new" className="btn-primary">{ct("Try again")}</a>} /></div>;
  const [visaOptions, wallet] = load;

  // Correction 3: group ACTIVE visa types under their ACTIVE destination
  // country; a country appears only when it has at least one active type.
  const countries: WizardCountry[] = [];
  for (const v of visaOptions) {
    let c = countries.find((x) => x.id === v.countryId);
    if (!c) {
      c = { id: v.countryId, name: countryName({ name: v.countryName, iso2: v.countryIso2 }, locale), visaTypes: [] };
      countries.push(c);
    }
    c.visaTypes.push({
      id: v.id,
      countryId: v.countryId,
      name: configName(v, locale),
      categoryName: configName({ name: v.categoryName, nameFr: v.categoryNameFr, nameAr: v.categoryNameAr }, locale),
      fee: v.fee,
      currency: v.currency,
      minDays: v.minDays,
      maxDays: v.maxDays,
      description: configDescription(v, locale) || null,
    });
  }

  const requirementMaps: Record<string, WizardRequirement[]> = {};
  const requirementsLoaded = await Promise.all(
    visaOptions.map(async (v) => {
      requirementMaps[v.id] = (await listRequirementsForVisaType(v.id)).map((r) => ({ ...r, name: (locale === "fr" ? r.nameFr : locale === "ar" ? r.nameAr : null)?.trim() || localizedDocTypeName(r.code, r.name, locale) }));
    }),
  ).then(() => true).catch(() => false);
  if (!requirementsLoaded) return <div className="card"><EmptyState title={ct("Visa services are temporarily unavailable")} body={ct("Please try again. Your wallet has not been charged.")} action={<a href="/portal/applications/new" className="btn-primary">{ct("Try again")}</a>} /></div>;

  // ?destination=<countryId> deep link — shareable destination, and the only
  // way to reach the programme cards without JavaScript.
  const destinationParam = typeof sp.destination === "string" ? sp.destination : null;

  const errorCode = typeof sp.error === "string" ? sp.error : null;
  const serverError = errorCode
    ? ct(`request.error.${errorCode}`) === `request.error.${errorCode}`
      ? ct("request.error.INTERNAL")
      : ct(`request.error.${errorCode}`)
    : null;

  const labels: WizardLabels = {
    stepChoose: ct("Visa & Traveller"),
    stepUpload: ct("Documents"),
    stepPreview: ct("Review & Submit"),
    destinationQuestion: ct("Where is your traveler going?"),
    destinationHint: ct("Search a destination and pick a visa programme. Only destinations with a bookable DZD programme are shown."),
    searchDestination: ct("Search a destination…"),
    noDestinationMatch: ct("No destination matches your search."),
    destinationsAvailable: ct("{count} destinations available"),
    popularDestinations: ct("Popular destinations"),
    destination: ct("Destination"),
    change: ct("Change"),
    chooseVisa: ct("Choose visa type"),
    selectVisa: ct("Pick a destination to see its visa programmes."),
    availableProgrammes: ct("Available visa programmes"),
    fee: ct("Fee"),
    processing: ct("Processing time"),
    days: ct("days"),
    processingUnspecified: ct("Processing time not specified"),
    notes: ct("Notes for ESSAFARIA (optional)"),
    notesPlaceholder: ct("Travel dates, group context, special requests…"),
    applicant: ct("Applicant"),
    fullName: ct("Full name"),
    fullNamePlaceholder: ct("Full name as in passport"),
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
    reviewSubtitle: ct("Check your visa, traveller and documents before submitting."),
    walletBalance: ct("Wallet balance"),
    balanceAfter: ct("Balance after submission"),
    chargeNote: ct("Your wallet will be charged when your application is submitted."),
    confirmSubmit: ct("Confirm & submit"),
    submitApplication: ct("Submit application"),
    submitting: ct("Submitting…"),
    missingPrefix: ct("Required documents missing"),
    summaryApplicant: ct("Applicant"),
    summaryDocuments: ct("Documents"),
    noDocumentsRequired: ct("This visa programme has no document requirements."),
    validationChooseCountry: ct("Choose a destination to continue."),
    validationChooseVisa: ct("Choose a visa programme to continue."),
    validationApplicant: ct("Enter the applicant's full name and choose a nationality."),
    searchNationality: ct("Choose nationality"),
    sectionVisa: ct("Visa"),
    programme: ct("Visa programme"),
    sectionApplicant: ct("Applicant"),
    sectionPayment: ct("Payment summary"),
    insufficientTitle: ct("Insufficient wallet balance"),
    requiredAmount: ct("Required amount"),
    currentBalance: ct("Current balance"),
    missingAmount: ct("Missing amount"),
    requestTopup: ct("Request wallet top-up"),
    uploaded: ct("Selected"),
    remove: ct("Remove"),
  };

  const uiLocale = locale === "ar" ? "ar" : locale === "fr" ? "fr" : "en";

  return (
    <>
      <PageHeader
        title={ct("New visa request")}
        subtitle={ct("Three steps: choose the destination and visa, upload the documents, preview and submit. Nothing is saved before the final confirmation.")}
      />
      <RequestWizard
        countries={countries}
        nationalities={NATIONALITIES.map((n) => ({ code: n.code, label: nationalityLabel(n.code, uiLocale) }))}
        defaultNationality={DEFAULT_NATIONALITY}
        requirementsByVisaType={requirementMaps}
        walletBalance={wallet.balance}
        walletCurrency={wallet.currency}
        locale={uiLocale}
        labels={labels}
        serverError={serverError}
        initialCountryId={destinationParam}
        topupPath="/portal/wallet"
      />
    </>
  );
}
