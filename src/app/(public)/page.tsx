import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { publicDestinations } from "@/lib/public-destinations";

export const dynamic = "force-dynamic";

const BENEFITS = [
  ["01", "End-to-end application handling", "From document checklist to embassy submission, every file is prepared, quality-checked and tracked by our operations team."],
  ["02", "Full visibility for your team", "Your agency portal shows live status, document review results, wallet activity and direct communication with our case officers."],
  ["03", "Configuration-driven precision", "Requirements, fees and processing times per destination are maintained centrally, so your agency always quotes the current rules."],
] as const;

const PROCESS = [
  ["01", "Agency access", "Register your agency and activate your account after review."],
  ["02", "Select visa", "Pick a destination and visa from the live partner catalogue."],
  ["03", "Upload documents", "Follow the configured checklist for each applicant."],
  ["04", "Submit & track", "Submit securely and follow the file in your portal."],
] as const;

const FAQ = [
  ["Who can register as a partner agency?", "Travel agencies, visa agencies, tour operators and professional travel partners can apply. Every registration is reviewed before access is activated."],
  ["Where can I see visa fees and requirements?", "Current programmes, document requirements and DZD partner fees are available in the Agency Portal after approval."],
  ["How do I follow an application?", "Your portal shows status, document requests, notifications and case communications for each submitted application."],
] as const;

export default async function HomePage() {
  const locale = await getUiLocale();
  const ct = contentT(locale);
  const destinations = await publicDestinations().catch(() => []);
  return (
    <>
      <section className="public-hero flex items-center" aria-labelledby="public-hero-title">
        <div className="ess-container relative z-10 py-24 sm:py-32 lg:py-40">
          <div className="max-w-[680px]">
            <p className="editorial-reveal text-xs font-semibold uppercase tracking-[0.24em] text-gold-400">{ct("B2B Visa Processing Platform")}</p>
            <h1 id="public-hero-title" className="editorial-reveal mt-6 font-serif text-[clamp(2.7rem,6vw,5.7rem)] leading-[1.04] tracking-tight text-white">{ct("Your trusted B2B visa partner")}</h1>
            <p className="editorial-reveal mt-6 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{ct("A professional visa service for agencies, with clear workflows, document support and live case tracking.")}</p>
            <div className="editorial-reveal mt-9 flex flex-wrap gap-3">
              <Link href="/agency/register" className="public-cta btn-gold hidden px-6 py-3 sm:inline-flex">{ct("Register your agency")} <span aria-hidden>→</span></Link>
              <Link href="/login" className="public-cta btn border border-white/55 bg-transparent px-6 py-3 text-white hover:bg-white/10">{ct("Access Agency Portal")} <span aria-hidden>→</span></Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/20 bg-navy-950/55 backdrop-blur-sm">
          <div className="ess-container grid grid-cols-2 gap-4 py-5 text-xs font-medium text-white/85 sm:grid-cols-4 sm:text-sm">
            {["Simple process", "Document assistance", "Live status tracking", "Professional support"].map((item, index) => (
              <span key={item} className="flex items-center gap-2"><span className="text-gold-400">0{index + 1}</span>{ct(item)}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="public-reveal ess-container py-20 sm:py-28" aria-labelledby="benefits-heading">
        <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">{ct("For professional partners")}</p>
            <h2 id="benefits-heading" className="mt-4 max-w-lg font-serif text-4xl leading-tight text-navy-900 sm:text-5xl">{ct("A visa desk built around your agency")}</h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600">{ct("ESSAFARIA VISA brings applications, documents, updates and partner billing together in one calm workspace.")}</p>
            <Link href="/b2b" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-navy-900 underline decoration-gold-500 underline-offset-8">{ct("For Agencies")} <span aria-hidden>→</span></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {BENEFITS.map(([number, title, body]) => (
              <article key={number} className="public-card card p-6">
                <span className="font-serif text-3xl text-gold-600">{number}</span>
                <h3 className="mt-8 text-base font-semibold leading-snug text-navy-900">{ct(title)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{ct(body)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-reveal bg-ivory-50 py-20 sm:py-24" aria-labelledby="destinations-heading">
        <div className="ess-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">{ct("Destinations")}</p>
              <h2 id="destinations-heading" className="mt-3 font-serif text-4xl text-navy-900">{ct("Available visa destinations")}</h2>
              <p className="mt-3 max-w-xl text-sm text-slate-600">{ct("Explore destinations with active visa services. Partner programme details are available after sign-in.")}</p>
            </div>
            <Link href="/countries" className="btn-secondary">{ct("All destinations →")}</Link>
          </div>
          {destinations.length ? (
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {destinations.slice(0, 8).map((row) => (
                <Link key={row.id} href="/countries" className="public-card group relative flex min-h-64 flex-col justify-between overflow-hidden rounded-2xl bg-navy-900 p-6 text-white">
                  <span className="absolute -end-2 -top-10 select-none font-serif text-[10rem] leading-none text-white/[.06]" aria-hidden>{row.iso2}</span>
                  <span className="relative text-xs font-semibold uppercase tracking-[0.16em] text-gold-400">{row.region ?? ct("Destination")}</span>
                  <span className="relative flex items-end justify-between gap-3">
                    <span className="font-serif text-3xl">{countryName(row, locale)}</span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-500 text-navy-950 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden>{locale === "ar" ? "←" : "→"}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : <p className="card mt-9 p-7 text-sm text-slate-600">{ct("Destinations are temporarily unavailable")}</p>}
        </div>
      </section>

      <section className="public-reveal ess-container py-20 sm:py-28" aria-labelledby="process-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">{ct("How it works")}</p>
        <h2 id="process-heading" className="mt-3 font-serif text-4xl text-navy-900">{ct("From access to application tracking")}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-4">
          {PROCESS.map(([step, title, body]) => (
            <div key={step} className="border-t border-navy-900/20 pt-5">
              <span className="font-serif text-3xl text-gold-600">{step}</span>
              <h3 className="mt-6 text-base font-semibold text-navy-900">{ct(title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{ct(body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="public-reveal bg-navy-900 py-20 text-white sm:py-24" aria-labelledby="partner-heading">
        <div className="ess-container grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">{ct("Why ESSAFARIA VISA")}</p>
            <h2 id="partner-heading" className="mt-4 max-w-2xl font-serif text-4xl leading-tight text-white sm:text-5xl">{ct("Experienced support for every stage of your visa workflow")}</h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75">{ct("Your team has one place to prepare applications, respond to document requests and follow decisions with clear visibility.")}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 p-8">
            <p className="font-serif text-3xl text-white">{ct("Become a partner agency")}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/75">{ct("Apply online. Our team reviews each registration before granting portal access.")}</p>
            <Link href="/agency/register" className="public-cta btn-gold mt-7 px-6 py-3">{ct("Register your agency")} <span aria-hidden>→</span></Link>
          </div>
        </div>
      </section>

      <section className="public-reveal ess-container py-20 sm:py-24" aria-labelledby="faq-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">{ct("FAQ")}</p>
        <h2 id="faq-heading" className="mt-3 font-serif text-4xl text-navy-900">{ct("Questions from partner agencies")}</h2>
        <div className="mt-8 max-w-4xl divide-y divide-line border-y border-line">
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-navy-900 focus-visible:outline-2 focus-visible:outline-gold-500">{ct(question)} <span className="text-xl font-normal text-gold-600 group-open:rotate-45" aria-hidden>+</span></summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{ct(answer)}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
