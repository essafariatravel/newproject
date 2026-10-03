import type { Metadata } from "next";
import { resolveRegistrationFollowup } from "@/lib/registration-followup";
import { registrationReviewCopy,resolveLocale } from "@/lib/i18n";
import { getUiLocale } from "@/lib/ui-i18n";
import { RegistrationUploadForm } from "@/components/registration-upload-form";
import { buildNoIndexMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export const metadata: Metadata = buildNoIndexMetadata("Agency verification", { referrer: "no-referrer" });
export default async function AgencyVerificationPage({params}: {params:Promise<{token:string}>}) {
  const {token} = await params;
  const resolved = await resolveRegistrationFollowup(token);
  const locale = resolved ? resolveLocale(resolved.locale) : await getUiLocale();
  const copy = registrationReviewCopy(locale);
  return <section className="ess-container max-w-2xl py-14" dir={locale === "ar" ? "rtl" : "ltr"}><p className="travel-eyebrow text-gold-700">ESSAFARIA</p><h1 className="mt-3 font-serif text-3xl text-navy-900">{copy.uploadTitle}</h1>{resolved ? <><p className="mt-2 text-xs text-slate-500"><bdi>{resolved.reference}</bdi></p><p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-700">{resolved.note}</p><p className="my-5 text-xs text-slate-500">{copy.uploadHint}</p><RegistrationUploadForm token={token} locale={locale} slots={resolved.slots}/></> : <p className="mt-6 text-sm leading-relaxed text-slate-600">{copy.invalid}</p>}</section>;
}
