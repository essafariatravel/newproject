import Link from "next/link";
import type { ReactNode } from "react";
import { identityT } from "@/lib/identity-copy";
import type { UiLocale } from "@/lib/ui-locale-values";
import "./documents.css";

export function PublicAccessPage({ locale, title, backLabel, children }: {
  locale: UiLocale;
  title: string;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="public-front-page public-access" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <div className="access-column">
        <h1>{title}</h1>
        {children}
        <Link href={`/login?lang=${locale}`} className="access-return">
          <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m9 4-6 6 6 6M3 10h14" />
          </svg>
          {backLabel ?? identityT(locale)("Back to sign in")}
        </Link>
      </div>
    </section>
  );
}
