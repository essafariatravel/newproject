"use client";

import { useEffect, useRef, useState } from "react";
import type { RegistrationLocale } from "@/lib/i18n";
import { registrationUi } from "../registration-ui";

export function ReceiptReference({ reference, label, locale }: {
  reference: string;
  label: string;
  locale: RegistrationLocale;
}) {
  const code = useRef<HTMLElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [feedback, setFeedback] = useState<"copying" | "copied" | "copyManually" | null>(null);
  useEffect(() => { setHydrated(true); }, []);
  const text = registrationUi[locale];
  async function copyReference() {
    setFeedback("copying");
    try {
      await navigator.clipboard.writeText(reference);
      setFeedback("copied");
    } catch {
      if (!code.current) return;
      const range = document.createRange();
      range.selectNodeContents(code.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setFeedback("copyManually");
    }
  }
  return (
    <div className="receipt-reference">
      <p>{label}</p>
      <bdi dir="ltr" ref={code}>{reference}</bdi>
      <button type="button" onClick={copyReference} disabled={!hydrated} aria-busy={feedback === "copying"}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <rect x="8" y="8" width="11" height="13" rx="2" />
          <path d="M14 8V4H4v12h4" />
        </svg>
        {text.copy}
      </button>
      <p role="status">{feedback && text[feedback]}</p>
    </div>
  );
}
