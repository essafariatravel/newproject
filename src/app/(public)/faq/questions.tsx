"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { UiLocale } from "@/lib/ui-locale-values";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";

const messages = {
  fr: { find: "Rechercher une question", clear: "Effacer la recherche", shown: "Questions affichées", none: "Aucune question correspondante.", all: "Afficher toutes les questions", help: "Besoin de précisions ?", contact: "Contacter le service visas" },
  en: { find: "Search questions", clear: "Clear search", shown: "Questions shown", none: "No matching questions.", all: "Show all questions", help: "Need more information?", contact: "Contact the visa desk" },
  ar: { find: "البحث عن سؤال", clear: "مسح البحث", shown: "الأسئلة المعروضة", none: "لا توجد أسئلة مطابقة.", all: "عرض جميع الأسئلة", help: "هل تحتاجون إلى توضيح؟", contact: "الاتصال بمكتب التأشيرات" },
} as const;

function searchable(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\p{M}ـ]/gu, "").replace(/ى/g, "ي").replace(/ة/g, "ه");
}

export function Questions({ locale, title, intro, items }: {
  locale: UiLocale; title: string; intro: string; items: Array<{ question: string; answer: string }>;
}) {
  const copy = messages[locale];
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const words = searchable(query.trim()).split(/\s+/u).filter(Boolean);
  const matches = items.filter(item => {
    const index = searchable(`${item.question} ${item.answer}`);
    return words.every(word => index.includes(word));
  });
  function clear() {
    setQuery("");
    input.current?.focus();
  }
  return <div className="info-width info-questions">
    <header className="info-hero-copy">
      <h1 id="faq-heading">{title}</h1>
      <p className="info-lead">{intro}</p>
      <div className="info-find" role="search" aria-label={copy.find}>
        <label htmlFor="find">{copy.find}</label>
        <div className="info-find-field">
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10.4" cy="10.4" r="6.4" /><path d="m15.3 15.3 5 5" /></svg>
          <input type="search" id="find" ref={input} autoComplete="off" value={query}
            aria-controls="faq-answers" onChange={event => setQuery(event.target.value)} />
          {query && <button type="button" onClick={clear} aria-label={copy.clear}>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 5 14 14M19 5 5 19" /></svg>
          </button>}
        </div>
        <p className="info-count" role="status">{copy.shown} <bdi>{new Intl.NumberFormat(locale).format(matches.length)}</bdi></p>
      </div>
      <noscript><style>{".info-find{display:none}"}</style></noscript>
    </header>
    <div>
      <div id="faq-answers">
        {matches.map(item => <details className="info-question" key={item.question} open={item === items[0]}>
          <summary><h2>{item.question}</h2></summary>
          <p>{item.answer}</p>
        </details>)}
        {!matches.length && <div className="info-no-results"><p>{copy.none}</p><button type="button" className="info-link" onClick={clear}>{copy.all}</button></div>}
      </div>
      <div className="info-help"><p>{copy.help}</p><Link className="info-link" href={seoLocalizedPublicPath("contact", locale)}>{copy.contact}</Link></div>
    </div>
  </div>;
}
