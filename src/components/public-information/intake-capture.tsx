"use client";

import { useId, useRef } from "react";
import type { UiLocale } from "@/lib/ui-locale-values";

const capture = {
  fr: { wide: 426, small: 498, sample: "Dossier de démonstration", enlarge: "Agrandir le formulaire", close: "Fermer" },
  en: { wide: 394, small: 466, sample: "Demonstration case", enlarge: "Enlarge the form", close: "Close" },
  ar: { wide: 392, small: 464, sample: "ملف توضيحي", enlarge: "تكبير الاستمارة", close: "إغلاق" },
} as const;

export function IntakeCapture({ locale, alt, preview = false }: { locale: UiLocale; alt: string; preview?: boolean }) {
  const labels = capture[locale];
  const title = useId();
  const opener = useRef<HTMLAnchorElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const image = `/images/workflow/intake-${locale}.webp`;
  const small = `/images/workflow/intake-${locale}-small.webp`;

  return <>
    <a className={preview ? "info-capture info-capture-preview" : "info-capture"} ref={opener}
      href={image} aria-haspopup="dialog" onClick={event => {
        if (!dialog.current?.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        dialog.current.showModal();
      }}>
      <span className="info-capture-action">
        {preview && <span>{labels.sample}</span>}
        <span>{labels.enlarge}<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" /></svg></span>
      </span>
      <picture>
        <source media="(max-width: 639px)" srcSet={small} width="686" height={labels.small} />
        <img src={image} alt={preview ? "" : alt} width="1344" height={labels.wide} loading={preview ? "eager" : "lazy"} decoding="async" />
      </picture>
    </a>
    <dialog className="info-capture-dialog" ref={dialog} aria-labelledby={title}
      onClose={() => opener.current?.focus({ preventScroll: true })}>
      <div><h3 id={title}>{labels.sample}</h3>
        <button type="button" onClick={() => dialog.current?.close()}>{labels.close}</button>
      </div>
      <picture><source media="(max-width: 639px)" srcSet={small} width="686" height={labels.small} />
        <img src={image} alt={alt} width="1344" height={labels.wide} decoding="async" loading="lazy" />
      </picture>
    </dialog>
  </>;
}
