"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { UiLocale } from "@/lib/ui-locale-values";

const copy = {
  fr: {
    steps: ["Visa et voyageur", "Documents", "Vérification et envoi"],
    question: "Où se rend votre voyageur ?", placeholder: "Rechercher une destination…",
    hint: "Recherchez une destination et choisissez un programme de visa. Seules les destinations disposant d’un programme réservable en DZD sont affichées.",
    countries: ["Turquie", "Émirats arabes unis"], sample: "Deux destinations d’exemple pour cette démonstration.",
    empty: "Aucune destination ne correspond à votre recherche.", enlarge: "Agrandir le formulaire",
    imageTitle: "Formulaire VISA OS · exemple", close: "Fermer",
  },
  en: {
    steps: ["Visa & Traveller", "Documents", "Review & Submit"],
    question: "Where is your traveler going?", placeholder: "Search a destination…",
    hint: "Search a destination and pick a visa programme. Only destinations with a bookable DZD programme are shown.",
    countries: ["Türkiye", "United Arab Emirates"], sample: "Two sample destinations in this demonstration.",
    empty: "No destination matches your search.", enlarge: "Enlarge the form",
    imageTitle: "VISA OS form · sample", close: "Close",
  },
  ar: {
    steps: ["التأشيرة والمسافر", "المستندات", "المراجعة والإرسال"],
    question: "إلى أين يسافر المسافر؟", placeholder: "ابحث عن وجهة…",
    hint: "ابحث عن الوجهة واختر برنامج التأشيرة. تُعرض فقط الوجهات التي تتضمن برنامجًا قابلًا للحجز بالدينار الجزائري.",
    countries: ["تركيا", "الإمارات العربية المتحدة"], sample: "وجهتان توضيحيتان في هذا العرض.",
    empty: "لا توجد وجهة مطابقة لبحثك.", enlarge: "تكبير النموذج",
    imageTitle: "نموذج VISA OS التوضيحي", close: "إغلاق",
  },
} as const;

const captureHeight = { en: [394, 466], fr: [426, 498], ar: [392, 464] } as const;

function searchKey(value: string) {
  return value.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function PublicVisaIntake({ locale, title, description, imageAlt }: {
  locale: UiLocale;
  title: string;
  description: string;
  imageAlt: string;
}) {
  const labels = copy[locale];
  const field = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLAnchorElement>(null);
  const [loadImage, setLoadImage] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = labels.countries.filter(name => searchKey(name).includes(searchKey(query)));
  const imageUrl = `/images/workflow/intake-${locale}.webp`;
  const picture = (
    <picture className="proof-screen">
      <source media="(max-width: 639px)" srcSet={`/images/workflow/intake-${locale}-small.webp`} width="686" height={captureHeight[locale][1]} />
      <img src={imageUrl} width="1344" height={captureHeight[locale][0]} alt={imageAlt} />
    </picture>
  );

  function dismiss() {
    setExpanded(false);
    setActive(-1);
  }

  function select(name: string) {
    setQuery(name);
    dismiss();
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setExpanded(true);
      if (!matches.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(index => index < 0 ? (step === 1 ? 0 : matches.length - 1) : (index + step + matches.length) % matches.length);
    } else if (event.key === "Enter" && expanded && (active >= 0 || matches.length === 1)) {
      event.preventDefault();
      const choice = matches[Math.max(0, active)];
      if (choice) select(choice);
    } else if (event.key === "Escape" && expanded) {
      event.stopPropagation();
      dismiss();
    }
  }

  return (
    <>
      <div className="proof-intro">
        <h3>{title}</h3>
        <p>{description}</p>
        <a className="intake-enlarge" ref={opener} href={imageUrl} aria-haspopup="dialog" onClick={event => {
          if (!dialog.current?.showModal || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setLoadImage(true);
          dialog.current.showModal();
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" /></svg>
          {labels.enlarge}
        </a>
      </div>
      <div className="intake-form">
        <ol className="intake-steps">{labels.steps.map((step, i) => (
          <li key={step} aria-current={i === 0 ? "step" : undefined}><b aria-hidden="true">{i + 1}</b>{step}</li>
        ))}</ol>
        <div className="intake-field">
          <label htmlFor={field}>{labels.question}</label>
          <p id={`${field}-hint`}>{labels.hint}</p>
          <div className="intake-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
            <input id={field} type="text" role="combobox" autoComplete="off" spellCheck={false}
              aria-autocomplete="list" aria-controls={`${field}-list`} aria-expanded={expanded}
              aria-describedby={`${field}-hint`} aria-activedescendant={expanded && active >= 0 ? `${field}-option-${active}` : undefined}
              placeholder={labels.placeholder} value={query} onClick={() => setExpanded(true)} onBlur={dismiss} onKeyDown={handleKey}
              onChange={event => { setQuery(event.target.value); setActive(-1); setExpanded(true); }} />
          </div>
          <div className="intake-options" hidden={!expanded}>
            <ul id={`${field}-list`} role="listbox" aria-label={labels.question}>{matches.map((country, i) => (
              <li key={country} id={`${field}-option-${i}`} role="option" aria-selected={active === i}
                onPointerDown={event => event.preventDefault()} onClick={() => select(country)}>{country}</li>
            ))}</ul>
            {matches.length === 0 && <p role="status">{labels.empty}</p>}
            <small>{labels.sample}</small>
          </div>
        </div>
      </div>
      <noscript><style>{".intake-form { display: none; }"}</style>{picture}</noscript>
      <dialog className="intake-dialog" ref={dialog} aria-labelledby={`${field}-title`} onClose={() => opener.current?.focus({preventScroll:true})}>
        <div><h3 id={`${field}-title`}>{labels.imageTitle}</h3>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={labels.close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg>
          </button>
        </div>
        {loadImage && picture}
      </dialog>
    </>
  );
}
