import { formatProcessingDays } from "@/lib/format";
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

async function getFeaturedVisas() {
  try {
    return await db
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
  } catch {
    // The brochure-style homepage remains useful while the catalogue is unavailable.
    return [];
  }
}

export default async function HomePage() {
  const settings = await getSiteSettings();
  const brandName = settingString(settings, "brand.name", "ESSAFARIA TRAVEL");
  const featured = await getFeaturedVisas();

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
              B2B Visa Processing Platform
            </p>
            <h1 className="mt-4 font-serif text-4xl leading-[1.15] text-navy-900 sm:text-5xl">
              The operating system for
              <span className="italic text-gold-600"> professional visa processing</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-500">
              {brandName} runs visa operations for travel agencies, wholesalers and tour operators —
              one platform for applications, documents, checklists, wallets and embassy workflows.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/agency/register" className="btn-primary px-6 py-3">
                Register your Agency
              </Link>
              <Link href="/visas" className="btn-secondary px-6 py-3">
                Explore visa services
              </Link>
            </div>
          </div>
          <div className="hidden items-center lg:flex">
            <div className="w-full rounded-[1.5rem] border border-white/70 bg-white/70 p-6 shadow-[var(--shadow-pop)] backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                Live operational snapshot
              </p>
              <div className="mt-4 space-y-3.5">
                {featured.slice(0, 4).map((v) => (
                  <div key={v.visaName} className="flex items-center justify-between gap-3 border-b border-line/70 pb-3.5 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{v.countryName}</p>
                      <p className="text-xs text-slate-400">
                        {formatProcessingDays(v.minDays, v.maxDays)}
                      </p>
                    </div>
                    <span className="badge bg-gold-100 text-gold-700 tabular-nums">
                      {formatAmount(v.fee, v.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-400">
                Fees shown from the live service catalogue. Final charge is always calculated server-side.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-line/70 bg-white/60">
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">What we operate</p>
        <h2 className="mt-2 max-w-2xl font-serif text-3xl text-navy-900">
          A complete visa desk behind your agency
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <div key={s.title} className="card p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]">
              <h3 className="font-serif text-lg text-navy-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destinations */}
      <section className="py-16">
        <div className="ess-container">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">Destinations</p>
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
                className="card tr-hover group p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{v.countryName}</p>
                <p className="mt-1 font-serif text-lg text-navy-900 group-hover:text-iris-700">{v.visaName}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    {formatProcessingDays(v.minDays, v.maxDays)}
                  </span>
                  <span className="font-semibold tabular-nums text-teal-600">
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">How it works</p>
        <h2 className="mt-2 font-serif text-3xl text-navy-900">From checklist to passport stamp</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((p) => (
            <div key={p.step} className="relative card p-6">
              <span className="font-serif text-2xl italic text-gold-500">{p.step}</span>
              <h3 className="mt-2 text-sm font-semibold text-navy-900">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.body}</p>
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
                Processing volumes your agency can scale with
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                Join the agencies and wholesalers running their entire visa desk on {brandName}.
              </p>
            </div>
            <Link href="/agency/register" className="btn bg-white px-6 py-3 text-navy-900 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.45)] hover:bg-gold-50">
              Register your Agency
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
