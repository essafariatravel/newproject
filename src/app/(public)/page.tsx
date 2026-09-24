import Link from "next/link";
import { getSiteSettings, settingString } from "@/lib/settings";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

const SERVICE_KEYS: [string, string][] = [
  ["End-to-end application handling", "From document checklist to embassy submission, every file is prepared, quality-checked and tracked by our operations team."],
  ["Configuration-driven precision", "Requirements, fees and processing times per destination are maintained centrally, so your agency always quotes the current rules."],
  ["Full visibility for your team", "Your agency portal shows live status, document review results, wallet activity and direct communication with our case officers."],
  ["Prepaid wallet billing", "No per-file invoices. Fund your agency wallet once and every submission is charged automatically with a complete audit trail."],
];

const PROCESS_KEYS: [string, string, string][] = [
  ["01", "Select visa", "Pick destination and visa category from the live catalogue."],
  ["02", "Add applicants", "Passenger details and passports are captured per traveller."],
  ["03", "Upload documents", "The generated checklist tells your team exactly what to provide."],
  ["04", "Submit & track", "Your wallet is charged, and the file moves through our workflow in real time."],
];



// Phase 2.1: the public homepage no longer queries or renders the visa
// catalogue. Visa categories and partner pricing are private B2B information
// (Agency Portal only), so the previous "Live operational snapshot" and
// "Popular visa programmes" price lists were removed — not merely hidden.

export default async function HomePage() {
  const settings = await getSiteSettings();
  const ct = contentT(await getUiLocale());
  const brandName = settingString(settings, "brand.name", "ESSAFARIA TRAVEL");

  return (
    <>
      {/* Hero — soft aurora on porcelain */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 340px at 82% 8%, rgb(130 144 230 / 0.22), transparent 64%), radial-gradient(560px 300px at 6% 92%, rgb(203 178 135 / 0.18), transparent 60%)",
          }}
        />
        <div className="ess-container relative grid grid-cols-1 gap-10 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">
              {ct("B2B Visa Processing Platform")}
            </p>
            <h1 className="mt-4 font-serif text-4xl leading-[1.15] text-navy-900 sm:text-5xl">
              {ct("The operating system for")}
              <span className="italic text-gold-600"> {ct("professional visa processing")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-500">
              {brandName} {ct("runs visa operations for travel agencies, wholesalers and tour operators — one platform for applications, documents, checklists, wallets and embassy workflows.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* §50 — at mobile widths the sticky header carries the ONE
                  visible "Register your agency" CTA; the hero repeats it from
                  `sm` up, where the header switches to its desktop layout. */}
              <Link href="/agency/register" className="btn-primary hidden px-6 py-3 sm:inline-flex">
                {ct("Register your agency")}
              </Link>
              <Link href="/visas" className="btn-secondary px-6 py-3">
                {ct("Explore visa services")}
              </Link>
            </div>
          </div>
          <div className="hidden items-center lg:flex">
            <div className="w-full rounded-[1.5rem] border border-white/70 bg-white/70 p-6 shadow-[var(--shadow-pop)] backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {ct("Built for professional visa operations")}
              </p>
              <div className="mt-4 space-y-3.5">
                {[
                  [ct("Checklists"), ct("Destination-accurate document lists per traveller.")],
                  [ct("Embassy desk"), ct("Submission, appointments and follow-up handled.")],
                  [ct("Live tracking"), ct("Every file visible through the full pipeline.")],
                  [ct("Partner billing"), ct("Transparent prepaid wallet per agency.")],
                ].map(([a, b], idx) => (
                  <div key={idx} className="flex items-start gap-3 border-b border-line/70 pb-3.5 last:border-0 last:pb-0">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-iris-100 text-[11px] font-bold text-iris-700">
                      ✓
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{a}</p>
                      <p className="text-xs text-slate-400">{b}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-400">
                {ct("Catalogue and partner pricing are served live inside the Agency Portal.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-line/70 bg-white/60">
        <div className="ess-container grid grid-cols-2 gap-6 py-8 text-center sm:grid-cols-4">
          {([
            [ct("Wholesale"), ct("volume pricing")],
            [ct("Dedicated"), ct("case officers")],
            [ct("Real-time"), ct("status tracking")],
            [ct("Audited"), ct("wallet billing")],
          ] as [string, string][]).map(([a, b], idx) => (
            <div key={idx}>
              <p className="font-serif text-lg text-navy-900">{a}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="ess-container py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">{ct("What we operate")}</p>
        <h2 className="mt-2 max-w-2xl font-serif text-3xl text-navy-900">
          {ct("A complete visa desk behind your agency")}
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SERVICE_KEYS.map(([title, body], idx) => (
            <div key={idx} className="card p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]">
              <h3 className="font-serif text-lg text-navy-900">{ct(title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{ct(body)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destinations — coverage marketing, no catalogue/pricing */}
      <section className="py-16">
        <div className="ess-container">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">{ct("Destinations")}</p>
              <h2 className="mt-2 font-serif text-3xl text-navy-900">{ct("Coverage across four regions")}</h2>
            </div>
            <Link href="/countries" className="btn-secondary btn-sm">
              {ct("All destinations →")}
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["Europe", "Schengen and UK corridors with consolidated checklists."],
              ["Americas", "US, Canada and regional visitor programmes."],
              ["Middle East", "GCC destinations with fast-track handling."],
              ["Asia", "High-volume visitor and business corridors."],
            ] as [string, string][]).map(([region, blurb], idx) => (
              <Link
                key={idx}
                href="/countries"
                className="card tr-hover group p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct(region)}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 group-hover:text-navy-900">{ct(blurb)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="ess-container py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">{ct("How it works")}</p>
        <h2 className="mt-2 font-serif text-3xl text-navy-900">{ct("From checklist to passport stamp")}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS_KEYS.map(([step, title, body]) => (
            <div key={step} className="relative card p-6">
              <span className="font-serif text-2xl italic text-gold-500">{step}</span>
              <h3 className="mt-2 text-sm font-semibold text-navy-900">{ct(title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{ct(body)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — soft gradient panel */}
      <section className="ess-container pb-4">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-iris-600 via-navy-800 to-navy-900 px-8 py-14 shadow-[var(--shadow-pop)] sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(480px 240px at 88% -10%, rgb(255 255 255 / 0.14), transparent 60%), radial-gradient(380px 220px at 4% 110%, rgb(203 178 135 / 0.25), transparent 60%)",
            }}
          />
          <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-serif text-2xl text-white sm:text-3xl">
                {ct("Processing volumes your agency can scale with")}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                {ct("Join the agencies and wholesalers running their entire visa desk on our platform.")}
              </p>
            </div>
            <Link
              href="/agency/register"
              className="btn hidden bg-white px-6 py-3 text-navy-900 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.45)] hover:bg-gold-50 sm:inline-flex"
            >
              {ct("Register your agency")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
