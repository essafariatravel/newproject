import Link from "next/link";
import { contentT } from "@/lib/i18n-content";
import type { PublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import type { UiLocale } from "@/lib/ui-locale-values";
import "./documents.css";

export const additionalDocuments = {
  "legal-notice": { kind: "legal_notice", en: "Legal notice", fr: "Mentions légales", ar: "البيانات القانونية" },
  cookies: { kind: "cookies", en: "Cookie policy", fr: "Politique de cookies", ar: "سياسة ملفات الارتباط" },
  commercial: { kind: "commercial", en: "B2B commercial terms", fr: "Conditions commerciales B2B", ar: "الشروط التجارية بين المهنيين" },
} as const;

type DocumentKey = "terms" | "privacy" | keyof typeof additionalDocuments;

const labels = {
  en: { documents: "Available documents", version: "Version", effective: "Effective date" },
  fr: { documents: "Documents disponibles", version: "Version", effective: "Date d’effet" },
  ar: { documents: "الوثائق المتاحة", version: "الإصدار", effective: "تاريخ السريان" },
};

export function LegalReader({ locale, documentKey, legal, effectiveDate }: {
  locale: UiLocale;
  documentKey: DocumentKey;
  legal: Pick<PublishedLegal, "body" | "version"> | null;
  effectiveDate: string | null;
}) {
  const ct = contentT(locale);
  const copy = labels[locale];
  const documents: { key: DocumentKey; path: string; title: string }[] = [
    { key: "terms", path: "/terms", title: ct("Terms of Service") },
    { key: "privacy", path: "/privacy", title: ct("Privacy Notice") },
    ...Object.entries(additionalDocuments).map(([slug, doc]) => ({
      key: slug as keyof typeof additionalDocuments, path: `/legal/${slug}`, title: doc[locale],
    })),
  ];
  const navigation = (
    <nav aria-label={copy.documents} className="document-index-links">
      {documents.map(({ key, title, path }) => (
        <Link key={key} href={`${path}?lang=${locale}`} aria-current={key === documentKey ? "page" : undefined}>
          {title}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="public-front-page public-document" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="document-layout">
        <aside className="document-index">
          <div className="document-index-desktop">
            <h2>{copy.documents}</h2>
            {navigation}
          </div>
          <details className="document-index-mobile">
            <summary>{copy.documents}</summary>
            {navigation}
          </details>
        </aside>
        <article className="document-article" aria-labelledby="public-document-heading">
          <h1 id="public-document-heading">{documents.find(({ key }) => key === documentKey)?.title}</h1>
          {legal ? (
            <>
              <dl className="document-metadata">
                <div><dt>{copy.version}</dt><dd><bdi dir="ltr">{legal.version}</bdi></dd></div>
                <div><dt>{copy.effective}</dt><dd>{effectiveDate}</dd></div>
              </dl>
              <div className="document-body">{legal.body}</div>
            </>
          ) : (
            <p role="status" className="document-unpublished">{publicBrandCopy(locale).legalMissing}</p>
          )}
        </article>
      </div>
    </div>
  );
}
