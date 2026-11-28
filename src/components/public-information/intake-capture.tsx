"use client";

import { useId, useRef, useState } from "react";
import type { UiLocale } from "@/lib/ui-locale-values";
import { visaCapture } from "./visa-capture";

const copy = {
  fr: { sample: "Exemple de demande de visa", enlarge: "Agrandir le formulaire", close: "Fermer" },
  en: { sample: "Sample visa application", enlarge: "Enlarge the form", close: "Close" },
  ar: { sample: "مثال لطلب تأشيرة", enlarge: "تكبير الاستمارة", close: "إغلاق" },
} as const;

export function IntakeCapture({ locale, alt, preview = false, linkLabel }: {
  locale: UiLocale;
  alt: string;
  preview?: boolean;
  linkLabel?: string;
}) {
  const labels = copy[locale];
  const image = visaCapture(locale);
  const title = useId();
  const opener = useRef<HTMLAnchorElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const action = <>
    {linkLabel ?? labels.enlarge}
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />
    </svg>
  </>;

  return <>
    <a className={linkLabel ? "intake-enlarge" : preview ? "info-capture info-capture-preview" : "info-capture"} ref={opener}
      href={image.wide} aria-haspopup="dialog" onClick={event => {
        if (!dialog.current?.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setOpened(true);
        dialog.current.showModal();
      }}>
      {linkLabel ? action : <>
        <span className="info-capture-action">
          {preview && <span>{labels.sample}</span>}
          <span>{action}</span>
        </span>
        <picture>
          <source media="(max-width: 639px)" srcSet={image.small} width={image.smallWidth} height={image.smallHeight} />
          <img src={image.wide} alt={preview ? "" : alt} width={image.width} height={image.height} loading={preview ? "eager" : "lazy"} decoding="async" />
        </picture>
      </>}
    </a>
    <dialog className={linkLabel ? "intake-dialog" : "info-capture-dialog"} ref={dialog} aria-labelledby={title}
      onClose={() => opener.current?.focus({ preventScroll: true })}>
      <div><h3 id={title}>{labels.sample}</h3>
        <button type="button" onClick={() => dialog.current?.close()}>{labels.close}</button>
      </div>
      {opened && (
        <picture className="proof-screen">
          <source media="(max-width: 639px)" srcSet={image.small} width={image.smallWidth} height={image.smallHeight} />
          <img src={image.wide} alt={alt} width={image.width} height={image.height} decoding="async" />
        </picture>
      )}
    </dialog>
  </>;
}
