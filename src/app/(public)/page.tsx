import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { countries, visaTypes } from "@/db/schema";
import { getSiteSettings, settingString } from "@/lib/settings";
import { formatAmount } from "@/lib/format";

export const dynamic = "force-dynamic";

const SERVICES = [
  {
    title: "End-to-end application handling",
    body: "From document checklist to embassy submission, every file is prepared, quality-checked and tracked by our operations team.",
  },
  {
    title: "Configuration-driven precision",
    body: "Requirements, fees and processing times per destination are maintained centrally, so your agency always quotes the current rules.",
  },
  {
    title: "Full visibility for your team",
    body: "Your agency portal shows live status, document review results, wallet activity and direct communication with our case officers.",
  },
  {
    title: "Prepaid wallet billing",
    body: "No per-file invoices. Fund your agency wallet once and every submission is charged automatically with a complete audit trail.",
  },
];

const PROCESS = [
  { step: "01", title: "Select visa", body: "Pick destination and visa category from the live catalogue." },
  { step: "02", title: "Add applicants", body: "Passenger details and passports are captured per traveller." },
  { step: "03", title: "Upload documents", body: "The generated checklist tells your team exactly what to provide." },
  { step: "04", title: "Submit & track", body: "Your wallet is charged, and the file moves through our workflow in real time." },
];

export default async function HomePage() {
  const settings = await getSiteSettings();
  const brandName = settingString(settings, "brand.name", "ESSAFARIA TRAVEL");

  const featured = await db
    .select({
      countryName: countries.name,
      visaName: visaTypes.name,
      fee: visaTypes.fee,
      currency: visaTypes.currency,
      minDays: visaTypes.processingMinDays,
      maxDays: visaTypes.processingMaxDays,
    })
    .from(visaTypes)
    .innerJoin(countries, eq(visaTypes.countryId, countries.id))
    .where(eq(visaTypes.active, true))
    .orderBy(asc(countries.sortOrder))
    .limit(6);

  return (
    <>
      {/* Hero */}
      <section className="bg-navy-950">
        <div className="ess-container grid grid-cols-1 gap-10 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-400">
              B2B Visa Processing Platform
            </p>
            <h1 className="mt-4 font-serif text-4xl leading-tight text-white sm:text-5xl">
              The operating system for
              <span className="text-gold-400"> professional visa processing</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
              {brandName} runs visa operations for travel agencies, wholesalers and tour operators —
              one platform for applications, documents, checklists, wallets and embassy workflows.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/b2b" className="btn-gold px-5 py-2.5">
                Become a partner agency
              </Link>
              <Link href="/visas" className="btn px-5 py-2.5 border border-white/25 text-white hover:bg-white/10">
                Explore visa services
              </Link>
            </div>
          </div>
          <div className="hidden items-center lg:flex">
            <div className="card w-full border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Live operational snapshot
              </p>
              <div className="mt-4 space-y-3.5">
                {featured.slice(0, 4).map((v) => (
                  <div key={v.visaName} className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-white">{v.countryName}</p>
                      <p className="text-xs text-slate-400">
                        {v.minDays}–{v.maxDays} days processing
                      </p>
                    </div>
                    <span className="badge bg-gold-400/15 text-gold-400 tabular-nums">
                      {formatAmount(v.fee, v.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-500">
                Fees shown from the live service catalogue. Final charge is always calculated server-side.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-navy-900/10 bg-ivory-100">
        <div className="ess-container grid grid-cols-2 gap-6 py-8 text-center sm:grid-cols-4">
          {[
            ["Wholesale", "volume pricing"],
            ["Dedicated", "case officers"],
            ["Real-time", "status tracking"],
            ["Audited", "wallet billing"],
          ].map(([a, b]) => (
            <div key={a}>
              <p className="font-serif text-lg text-navy-900">{a}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="ess-container py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">What we operate</p>
        <h2 className="mt-2 max-w-2xl font-serif text-3xl text-navy-900">
          A complete visa desk behind your agency
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <div key={s.title} className="card p-6">
              <h3 className="font-serif text-lg text-navy-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destinations */}
      <section className="bg-white py-16">
        <div className="ess-container">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">Destinations</p>
              <h2 className="mt-2 font-serif text-3xl text-navy-900">Popular visa programmes</h2>
            </div>
            <Link href="/countries" className="btn-secondary btn-sm">
              All destinations →
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((v) => (
              <Link
                key={v.visaName}
                href="/visas"
                className="card tr-hover group p-5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{v.countryName}</p>
                <p className="mt-1 font-serif text-lg text-navy-900 group-hover:text-navy-700">{v.visaName}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    {v.minDays}–{v.maxDays} days
                  </span>
                  <span className="font-medium tabular-nums text-teal-700">
                    from {formatAmount(v.fee, v.currency)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="ess-container py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">How it works</p>
        <h2 className="mt-2 font-serif text-3xl text-navy-900">From checklist to passport stamp</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((p) => (
            <div key={p.step} className="relative card p-6">
              <span className="font-serif text-2xl text-gold-500">{p.step}</span>
              <h3 className="mt-2 text-sm font-semibold text-navy-900">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy-900">
        <div className="ess-container flex flex-col items-start justify-between gap-6 py-14 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-serif text-2xl text-white sm:text-3xl">
              Processing volumes your agency can scale with
            </h2>
            <p className="mt-2 max-w-xl text-slate-300">
              Join the agencies and wholesalers running their entire visa desk on {brandName}.
            </p>
          </div>
          <Link href="/b2b#partner" className="btn-gold px-6 py-3">
            Start a partnership
          </Link>
        </div>
      </section>
    </>
  );
}
