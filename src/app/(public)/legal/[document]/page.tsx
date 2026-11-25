import { notFound } from "next/navigation";
import { additionalDocuments, LegalReader } from "@/components/public-documents/legal-reader";
import { getUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function LegalDocumentPage({ params, searchParams }: {
  params: Promise<{ document: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { document } = await params;
  if (!Object.hasOwn(additionalDocuments, document)) notFound();
  const documentKey = document as keyof typeof additionalDocuments;
  const locale = await getUiLocale(await searchParams);
  const legal = await readPublishedLegal(additionalDocuments[documentKey].kind, locale);
  return (
    <LegalReader documentKey={documentKey} locale={locale} legal={legal}
      effectiveDate={legal ? formatDate(legal.effectiveAt, locale) : null} />
  );
}
