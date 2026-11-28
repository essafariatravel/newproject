import type { Metadata } from "next";
import { LegalReader } from "@/components/public-documents/legal-reader";
import { readPublishedLegal } from "@/lib/legal";
import { getUiLocale } from "@/lib/ui-i18n";
import { formatDate } from "@/lib/format";
import { LEGAL_PUBLIC_DESCRIPTIONS } from "@/lib/legal-public-seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const legal = await readPublishedLegal("terms", locale);
  return {
    title: {"en":"Terms of Service","fr":"Conditions d’utilisation","ar":"شروط الخدمة"}[locale],
    description: legal ? LEGAL_PUBLIC_DESCRIPTIONS.terms[locale] : undefined,
    robots: legal ? undefined : { index: false, follow: false },
  };
}

export default async function TermsPage() {
  const locale = await getUiLocale();
  const legal = await readPublishedLegal("terms", locale);

  return (
    <LegalReader documentKey="terms" locale={locale} legal={legal}
      effectiveDate={legal ? formatDate(legal.effectiveAt, locale) : null} />
  );
}
