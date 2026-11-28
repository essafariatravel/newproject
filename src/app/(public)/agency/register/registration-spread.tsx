"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { RegistrationLocale } from "@/lib/i18n";
import { registrationUi, type RegistrationSection } from "./registration-ui";

export function RegistrationSpread({ locale, title, introduction, alreadyPartner, signIn, agencyName, section, children }: {
  locale: RegistrationLocale;
  title: string;
  introduction: string;
  alreadyPartner: string;
  signIn: string;
  agencyName?: string;
  section?: RegistrationSection;
  children: ReactNode;
}) {
  const text = registrationUi[locale];
  const router = useRouter();

  useEffect(() => {
    if (document.documentElement.lang !== locale) router.refresh();
  }, [locale, router]);

  return (
    <section className="public-front-page front-register" dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale} aria-labelledby="register-title">
      <div className="registration-spread-inner">
        <div className="registration-intro">
          <h1 id="register-title">{title}</h1>
          <p className="registration-intro-text">{introduction}</p>
          {section && (
            <div className="registration-folder" aria-hidden="true" data-section={section}>
              <div className="registration-folder-back" />
              <div className="registration-leaf" />
              <div className="registration-folder-cover">
                <svg className="registration-orbit" viewBox="0 0 320 320" fill="none" focusable="false">
                  <g transform="rotate(-35 160 160)" stroke="currentColor">
                    <ellipse cx="159" cy="155" rx="86" ry="123" />
                    <ellipse cx="165" cy="161" rx="61" ry="119" />
                    <path className="registration-orbit-gold" d="M-28 174C35 110 150 89 254 103s101 64 35 103-174 52-277 29" />
                    <path d="M-4 213c70 9 210-9 283-54" />
                  </g>
                </svg>
                <div className="registration-folder-label">
                  <span>{text.dossier}</span>
                  <b dir="auto">{agencyName?.trim() || text.agency}</b>
                </div>
              </div>
            </div>
          )}
          <p className="registration-access">{alreadyPartner} <Link href={"/login?lang=" + locale}>{signIn}</Link></p>
        </div>
        <div className="registration-sheet">{children}</div>
      </div>
    </section>
  );
}
