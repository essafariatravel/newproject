"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { UI_LOCALE_COOKIE, type UiLocale } from "@/lib/ui-locale-values";
import { registrationFields, type RegistrationDraft } from "@/lib/registration-draft";
import { registrationSections, type RegistrationSection } from "./registration-ui";

type Transfer = { to: UiLocale; values: RegistrationDraft; section: RegistrationSection; accuracy: boolean };
let transfer: Transfer | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;

function clearTransfer() {
  clearTimeout(expiry);
  transfer = undefined;
}

function prepareTransfer(to: UiLocale) {
  clearTransfer();
  const form = document.querySelector<HTMLFormElement>(".front-register form.registration-form");
  if (!form) return;
  const values = readRegistrationDraft(form);
  const section = registrationSections.find(item => item === form.dataset.step) ?? "company";
  const accuracy = form.elements.namedItem("accuracy");
  transfer = { to, values, section, accuracy: accuracy instanceof HTMLInputElement && accuracy.checked };
  // Only a language selection creates a transfer. It exists in this JS
  // document alone and expires even if navigation is interrupted.
  expiry = setTimeout(clearTransfer, 30_000);
}

export function readRegistrationDraft(form: HTMLFormElement): RegistrationDraft {
  return Object.fromEntries(registrationFields.map(name => {
    const control = form.elements.namedItem(name);
    return [name, control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? control.value : ""];
  })) as RegistrationDraft;
}

export function restoreRegistrationLanguage(form: HTMLFormElement, locale: UiLocale, finished: boolean) {
  if (transfer?.to !== locale) return;
  const { values, section, accuracy: confirmed } = transfer;
  for (const name of registrationFields) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement && !input.value) input.value = values[name];
    if (input instanceof HTMLSelectElement && values[name]) input.value = values[name];
  }
  const accuracy = form.elements.namedItem("accuracy");
  if (accuracy instanceof HTMLInputElement && confirmed) accuracy.checked = true;
  if (finished) clearTransfer();
  return section;
}

export function RegistrationLanguageLink({ locale, current, className, children }: {
  locale: UiLocale;
  current: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/agency/register?lang=${locale}`} lang={locale} replace scroll={false} prefetch={false}
      aria-current={current ? "true" : undefined} className={className}
      onNavigate={event => {
        if (current) { event.preventDefault(); return; }
        prepareTransfer(locale);
        const secure = location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${UI_LOCALE_COOKIE}=${locale}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
      }}>
      {children}
    </Link>
  );
}
