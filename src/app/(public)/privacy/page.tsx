import type { Metadata } from "next";
import { LegalReader } from "@/components/public-documents/legal-reader";
import { readPublishedLegal } from "@/lib/legal";
import { getUiLocale } from "@/lib/ui-i18n";
import { formatDate } from "@/lib/format";
import { LEGAL_PUBLIC_DESCRIPTIONS } from "@/lib/legal-public-seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const legal = await readPublishedLegal("privacy", locale);
  return {
    title: {"en":"Privacy Notice","fr":"Avis de confidentialité","ar":"إشعار الخصوصية"}[locale],
    description: legal ? LEGAL_PUBLIC_DESCRIPTIONS.privacy[locale] : undefined,
    robots: legal ? undefined : { index: false, follow: false },
  };
}

export default async function PrivacyPage() {
  const locale = await getUiLocale();
  const legal = await readPublishedLegal("privacy", locale);

  return (
    <LegalReader documentKey="privacy" locale={locale} legal={legal}
      effectiveDate={legal ? formatDate(legal.effectiveAt, locale) : null} />
  );
}
