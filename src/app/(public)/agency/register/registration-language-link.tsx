"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { UI_LOCALE_COOKIE, type UiLocale } from "@/lib/ui-locale-values";

const fields = ["legalName", "city", "contactFirstName", "email", "phone"] as const;
type Field = typeof fields[number];
type Transfer = { to: UiLocale; values: Partial<Record<Field, string>>; accuracy: boolean };
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
  const values: Partial<Record<Field, string>> = {};
  for (const name of fields) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) values[name] = input.value;
  }
  const accuracy = form.elements.namedItem("accuracy");
  transfer = { to, values, accuracy: accuracy instanceof HTMLInputElement && accuracy.checked };
  // Only a language selection creates a transfer. It exists in this JS
  // document alone and expires even if navigation is interrupted.
  expiry = setTimeout(clearTransfer, 30_000);
}

export function restoreRegistrationLanguage(form: HTMLFormElement, locale: UiLocale, finished: boolean) {
  if (transfer?.to !== locale) return;
  for (const name of fields) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement && !input.value) input.value = transfer.values[name] ?? "";
  }
  const accuracy = form.elements.namedItem("accuracy");
  if (accuracy instanceof HTMLInputElement && transfer.accuracy) accuracy.checked = true;
  if (finished) clearTransfer();
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
