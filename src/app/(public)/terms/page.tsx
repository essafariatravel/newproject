import { getSiteSettings, settingString } from "@/lib/settings";
import { getUiLocale } from "@/lib/ui-i18n";
import { formatMonthYear } from "@/lib/format";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const settings = await getSiteSettings();
  const locale = await getUiLocale();
  const ct = contentT(locale);
  // §Settings EN/FR/AR — the language-specific copy wins when it exists; the
  // single-language value (and then the built-in fallback) keeps older
  // installations working without overwriting anyone's published text.
  const body =
    settingString(settings, `legal.terms.${locale}`) ||
    settingString(settings, "legal.terms") ||
    "These terms will be published shortly.";
  return (
    <div className="ess-container max-w-3xl py-14">
      <h1 className="font-serif text-3xl text-navy-900">{ct("Terms of Service")}</h1>
      <p className="mt-1 text-xs text-slate-400">
        {ct("Last updated")} {formatMonthYear(new Date(), locale)}
      </p>
      <div className="card mt-8 whitespace-pre-line p-8 text-[15px] leading-relaxed text-slate-700">
        {body}
      </div>
    </div>
  );
}
