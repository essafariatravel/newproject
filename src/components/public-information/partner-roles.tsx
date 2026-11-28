"use client";

import { useId, useRef, useState } from "react";
import type { UiLocale } from "@/lib/ui-locale-values";
import { IntakeCapture } from "./intake-capture";

const rolesLabel = { fr: "Qui intervient ?", en: "Who handles the file?", ar: "من يتولّى الملف؟" };
const shortRoles = {
  fr: ["Agence", "Équipe visa", "Portefeuille"],
  en: ["Agency", "Visa team", "Wallet"],
  ar: ["الوكالة", "الفريق", "المحفظة"],
};

export function PartnerRoles({ locale, title, roles, alt }: {
  locale: UiLocale; title: string; roles: Array<{ title: string; detail: string }>; alt: string;
}) {
  const [current, setCurrent] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  return <section className="info-desk" aria-labelledby="desk-title">
    <div className="info-desk-signature"><bdi dir="ltr">Visa OS</bdi><span>{rolesLabel[locale]}</span></div>
    <h2 id="desk-title">{title}</h2>
    <div className="info-role-tabs" role="tablist" aria-label={rolesLabel[locale]} ref={list}>
      {roles.map((role, index) => <button key={index} type="button" role="tab" aria-description={role.title}
        id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
        aria-selected={index === current} tabIndex={index === current ? 0 : -1}
        onClick={() => setCurrent(index)}
        onKeyDown={event => {
          const direction = locale === "ar" ? -1 : 1;
          let next: number;
          switch (event.key) {
            case "ArrowLeft": next = (index - direction + roles.length) % roles.length; break;
            case "ArrowRight": next = (index + direction + roles.length) % roles.length; break;
            case "Home": next = 0; break;
            case "End": next = roles.length - 1; break;
            default: return;
          }
          event.preventDefault();
          setCurrent(next);
          list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{shortRoles[locale][index]}</button>)}
    </div>
    {roles.map((role, index) => <div key={index} role="tabpanel" className="info-role-panel"
      id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={index !== current} tabIndex={0}>
      <p>{role.detail}</p>
    </div>)}
    <noscript><style>{".info-role-tabs,.info-role-panel{display:none}"}</style>
      <dl className="info-role-transcript">{roles.map(role => <div key={role.title}><dt>{role.title}</dt><dd>{role.detail}</dd></div>)}</dl>
    </noscript>
    <IntakeCapture locale={locale} alt={alt} preview />
  </section>;
}
