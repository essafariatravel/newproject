"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IntakeCapture } from "./public-information/intake-capture";
import { publicVisaTourCopy } from "@/lib/public-visa-tour-copy";
import type { UiLocale } from "@/lib/ui-locale-values";

const flags = ["tr", "ae"] as const;
const exampleFiles = ["passport.pdf", "accommodation.pdf"] as const;

function searchKey(value: string) {
  return value.trim().normalize("NFKD").replace(/[\p{M}ـ]/gu, "").toLowerCase();
}

function CountryFlag({ index }: { index: number }) {
  return <img className="visa-tour-flag" src={"/images/workflow/flags/" + flags[index] + ".svg"} alt="" width="24" height="18" />;
}

function DestinationPicker({ locale, selected, onSelect }: {
  locale: UiLocale; selected: number | null; onSelect: (index: number | null) => void;
}) {
  const copy = publicVisaTourCopy[locale];
  const input = useRef<HTMLInputElement>(null);
  const change = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = copy.countries.map((name,index) => ({name,index})).filter(option => searchKey(option.name).includes(searchKey(text)));
  function choose(index: number) {
    onSelect(index);
    setOpen(false);
    setText("");
    setActive(-1);
    requestAnimationFrame(() => change.current?.focus({preventScroll:true}));
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "Enter" && open && (active >= 0 || options.length === 1)) {
      const item = options[Math.max(0, active)];
      if (item) { event.preventDefault(); choose(item.index); }
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setOpen(true);
    if (!options.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    setActive(last => last < 0 ? (direction === 1 ? 0 : options.length - 1) : (last + direction + options.length) % options.length);
  }
  if (selected !== null) return <div className="visa-tour-country">
    <strong><CountryFlag index={selected} />{copy.countries[selected]}</strong>
    <button ref={change} type="button" onClick={() => {onSelect(null); requestAnimationFrame(() => input.current?.focus());}}>{copy.change}</button>
  </div>;
  return <div className="visa-tour-picker">
    <label className="sr-only" htmlFor={id}>{copy.search}</label>
    <div className="intake-search">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
      <input ref={input} id={id} role="combobox" type="search" autoComplete="off" aria-haspopup="listbox" aria-autocomplete="list"
        aria-expanded={open} aria-controls={id+"-list"} aria-activedescendant={open && active >= 0 ? id+"-option-"+active : undefined}
        placeholder={copy.search} value={text} onFocus={() => setOpen(true)} onBlur={() => {setOpen(false);setActive(-1);}}
        onClick={() => setOpen(true)} onKeyDown={onKey} onChange={event=>{setText(event.target.value);setOpen(true);setActive(-1);}} />
    </div>
    <div className="visa-tour-suggestions" hidden={!open}>
      <p>{copy.suggestions}</p>
      <ul role="listbox" id={id+"-list"} aria-label={copy.suggestions}>
        {options.map((item,i)=><li key={item.index} role="option" id={id+"-option-"+i} aria-selected={active===i}
          onPointerDown={event=>event.preventDefault()} onClick={()=>choose(item.index)}><CountryFlag index={item.index} />{item.name}</li>)}
      </ul>
      {!options.length && <p role="status">{copy.noMatch}</p>}
    </div>
    <div className="visa-tour-shortcuts">
      <p>{copy.suggestions}</p>
      <ul>
        {copy.countries.map((name, index) => <li key={name}>
          <button type="button" onClick={() => choose(index)}><CountryFlag index={index} />{name}</button>
        </li>)}
      </ul>
    </div>
  </div>;
}

export function PublicVisaIntake({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  const copy = publicVisaTourCopy[locale];
  const rail = useRef<HTMLFieldSetElement>(null);
  const [step,setStep] = useState(0);
  const [country,setCountry] = useState<number | null>(null);
  const [documentIndex,setDocumentIndex] = useState(0);
  const [attached,setAttached] = useState([false,false]);
  const count = attached.filter(Boolean).length;
  const numbers = new Intl.NumberFormat(locale);
  const progress = numbers.format(count)+" / "+numbers.format(2);
  function goTo(index:number) {
    const radio = rail.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]')[index];
    radio?.click();
    radio?.focus({preventScroll:true});
  }
  const destination = country === null ? copy.select : copy.countries[country];
  const summary = <dl className="visa-tour-record">
    <div><dt>{copy.destination}</dt><dd>{country!==null && <CountryFlag index={country} />}{destination}</dd></div>
    <div><dt>{copy.traveller}</dt><dd>{copy.exampleTraveller}</dd></div>
    <div><dt>{copy.docsSummary}</dt><dd aria-live="polite"><bdi dir="ltr">{progress}</bdi></dd></div>
  </dl>;
  return <section id="visa-services" className="platform-width workspace-tour visa-tour" aria-labelledby="chapter-title">
    <header className="tour-heading"><h2 id="chapter-title">{copy.title}</h2>
      <p className="sample-reference">{copy.sample}</p>
    </header>
    <fieldset ref={rail} className="visa-tour-rail">
      <legend className="sr-only">{copy.navigation}</legend>
      {copy.steps.map((label,i)=><div className="visa-tour-stop" key={i}>
        <input id={"visa-chapter-"+i} name="visa-chapter" type="radio" defaultChecked={i===0}
          onChange={()=>setStep(i)} aria-controls={"visa-explanation-"+i} />
        <label htmlFor={"visa-chapter-"+i}>
          <span className="visa-tour-marker" aria-hidden="true">
            <span className="visa-tour-number">{i<step ? "✓" : numbers.format(i+1)}</span>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 10 21 3l-7 18-4-7-7-4Zm7 4L21 3"/></svg>
          </span>{label}
        </label>
      </div>)}
      <section id="visa-explanation-0" className="visa-tour-pane">
        <div><h3>{copy.question}</h3><DestinationPicker locale={locale} selected={country} onSelect={setCountry}/>
          <div className="visa-tour-tools"><IntakeCapture locale={locale} alt={copy.screenshot} linkLabel={copy.enlarge} /></div>
        </div>
        <div className="visa-tour-summary">
          <h3>{copy.trip}</h3>{summary}
          <button type="button" className="visa-tour-action" disabled={country === null} onClick={()=>goTo(1)}>{copy.next}</button>
        </div>
      </section>
      <section id="visa-explanation-1" className="visa-tour-pane">
        <div><h3>{copy.docs}</h3><div className="visa-tour-doc-list">
          {copy.requirements.map((label,i)=><button type="button" key={i} aria-pressed={documentIndex===i} onClick={()=>setDocumentIndex(i)}>
            <span>{label}</span><small>{attached[i]?copy.selected:copy.pending}</small>
          </button>)}
        </div></div>
        <div className="visa-tour-summary"><h3>{copy.requirements[documentIndex]}</h3><p>{copy.documentHints[documentIndex]}</p>
          {attached[documentIndex] && <p className="visa-tour-file"><bdi dir="ltr">{exampleFiles[documentIndex]}</bdi></p>}
          <div className="visa-tour-tools"><button className="visa-tour-text" type="button" onClick={()=>setAttached(files=>files.map((v,i)=>i===documentIndex?!v:v))}>
            {attached[documentIndex]?copy.remove:copy.selectFile}
          </button></div>
          <button type="button" className="visa-tour-action" disabled={count < copy.requirements.length} onClick={()=>goTo(2)}>{copy.review}</button>
        </div>
      </section>
      <section id="visa-explanation-2" className="visa-tour-pane">
        <div><h3>{copy.recap}</h3>{summary}<button className="visa-tour-text" type="button" onClick={()=>goTo(0)}>{copy.change}</button></div>
        <div className="visa-tour-summary"><h3>{copy.payment}</h3><p>{copy.wallet}</p>
          <p className="visa-tour-planning">{copy.planning}</p>
          <Link className="visa-tour-action" href={"/login?lang="+locale}>{copy.signIn}</Link>
        </div>
        {children}
      </section>
    </fieldset>
    <noscript><style>{".visa-tour-picker,.visa-tour-pane button{display:none}"}</style></noscript>
  </section>;
}
