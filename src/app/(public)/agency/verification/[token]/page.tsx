import { resolveRegistrationFollowup } from "@/lib/registration-followup";
import { registrationReviewCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, getUiLocaleFromSearch } from "@/lib/ui-i18n";
import { RegistrationUploadForm } from "@/components/registration-upload-form";
import { PublicAccessPage } from "@/components/public-documents/access-page";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function AgencyVerificationPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const resolved = await resolveRegistrationFollowup(token);
  const locale = getUiLocaleFromSearch(await searchParams) ?? (resolved ? resolveLocale(resolved.locale) : await getUiLocale());
  const copy = registrationReviewCopy(locale);
  return (
    <PublicAccessPage locale={locale} title={copy.uploadTitle}>
      {resolved ? (
        <>
          <div className="access-file-note">
            <bdi dir="ltr">{resolved.reference}</bdi>
            <p dir="auto">{resolved.note}</p>
          </div>
          <p className="access-file-hint">{copy.uploadHint}</p>
          <div className="access-uploads">
            <RegistrationUploadForm token={token} locale={locale} slots={resolved.slots} />
          </div>
        </>
      ) : <p role="status" className="access-notice">{copy.invalid}</p>}
    </PublicAccessPage>
  );
}
