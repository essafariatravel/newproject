"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RegistrationLocale } from "@/lib/i18n";
import { registrationSections, registrationUi, type RegistrationSection } from "./registration-ui";
import { restoreRegistrationLanguage } from "./registration-language-link";

export function RegistrationSpread({ locale, title, introduction, alreadyPartner, signIn, available, children }: {
  locale: RegistrationLocale;
  title: string;
  introduction: string;
  alreadyPartner: string;
  signIn: string;
  available: boolean;
  children: ReactNode;
}) {
  const text = registrationUi[locale];
  const sheet = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [agencyName, setAgencyName] = useState("");
  const [activeSection, setActiveSection] = useState<RegistrationSection>("company");

  useEffect(() => {
    if (!available || !sheet.current) return;
    const form = sheet.current.querySelector<HTMLFormElement>("form.registration-form");
    const layoutIsCurrent = document.documentElement.lang === locale;
    if (form) restoreRegistrationLanguage(form, locale, layoutIsCurrent);
    // A client navigation can reuse the existing public layout. Refresh its
    // translated header, footer and document direction with the chosen cookie.
    if (!layoutIsCurrent) router.refresh();
    // Native autofill or typing can precede hydration. The visible cover follows
    // the real control, including when the browser restores it on navigation.
    const nameField = sheet.current.querySelector<HTMLInputElement>('input[name="legalName"]');
    const readName = () => setAgencyName(nameField?.value ?? "");
    readName();
    window.addEventListener("pageshow", readName);
    const groups = Array.from(sheet.current.querySelectorAll("fieldset[data-section]"));
    // Keep the index aligned with the form when someone reads it by scrolling.
    let frame = 0;
    function update() {
      frame = 0;
      const boundary = Math.min(window.innerHeight * .35, 220);
      const visible = groups.filter(group => group.getBoundingClientRect().top <= boundary).pop();
      setActiveSection((visible?.getAttribute("data-section") as RegistrationSection) ?? "company");
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pageshow", readName);
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [available, locale, router]);

  return (
    <section className="public-front-page front-register" dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale} aria-labelledby="register-title">
      <div className="registration-spread-inner">
        <div className="registration-intro">
          <div>
            <h1 id="register-title">{title}</h1>
            <p className="registration-intro-text">{introduction}</p>
          </div>
          {available && (
            <div className="registration-folder" aria-hidden="true" data-section={activeSection}>
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
                  <b dir="auto">{agencyName.trim() || text.agency}</b>
                </div>
              </div>
            </div>
          )}
          <p className="registration-access">{alreadyPartner} <Link href={`/login?lang=${locale}`}>{signIn}</Link></p>
        </div>
        <div className="registration-sheet" ref={sheet}
          onInput={(event) => {
            if (event.target instanceof HTMLInputElement && event.target.name === "legalName") {
              setAgencyName(event.target.value);
            }
          }}
          onFocus={(event) => {
            const group = event.target.closest<HTMLElement>("fieldset[data-section]");
            if (group) setActiveSection(group.dataset.section as RegistrationSection);
          }}>
          {available && (
            <nav className="registration-index" aria-label={text.navigation}>
              {registrationSections.map(section => (
                <a key={section} href={`#registration-${section}`}
                  aria-current={activeSection === section ? "location" : undefined}
                  onClick={() => setActiveSection(section)}>{text[section]}</a>
              ))}
            </nav>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
