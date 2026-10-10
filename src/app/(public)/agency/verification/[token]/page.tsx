import { resolveRegistrationFollowup } from "@/lib/registration-followup";
import { registrationReviewCopy,resolveLocale } from "@/lib/i18n";
import { getUiLocale } from "@/lib/ui-i18n";
import { RegistrationUploadForm } from "@/components/registration-upload-form";
export const dynamic = "force-dynamic";
export const metadata = {robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function AgencyVerificationPage({params}: {params:Promise<{token:string}>}) {
  const {token} = await params;
  const resolved = await resolveRegistrationFollowup(token);
  const locale = resolved ? resolveLocale(resolved.locale) : await getUiLocale();
  const copy = registrationReviewCopy(locale);
  return <section className="ess-container max-w-2xl py-8" dir={locale === "ar" ? "rtl" : "ltr"}><p className="travel-eyebrow text-gold-700">ESSAFARIA</p><h1 className="mt-4 font-serif text-[32px] text-navy-900">{copy.uploadTitle}</h1>{resolved ? <><p className="mt-2 text-xs text-slate-500"><bdi>{resolved.reference}</bdi></p><p className="mt-6 whitespace-pre-line text-base leading-relaxed text-slate-700">{resolved.note}</p><p className="my-6 text-xs text-slate-500">{copy.uploadHint}</p><RegistrationUploadForm token={token} locale={locale} slots={resolved.slots}/></> : <p className="mt-6 text-base leading-relaxed text-slate-600">{copy.invalid}</p>}</section>;
}
