import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export const metadata = { title: "Visa Services" };

/**
 * PUBLIC marketing page — deliberately DB-free.
 *
 * Phase 2.1 change: visa programmes, categories and PRICES are private B2B
 * information served only inside the authenticated Agency Portal. This page
 * must never query the visa catalogue: anonymous visitors see only what
 * ESSAFARIA does, never a price list.
 */

const SERVICE_LINES = [
  {
    title: "Tourist & visitor visas",
    body: "Multi-destination short-stay processing with destination-specific checklists, form preparation and embassy submission.",
  },
  {
    title: "Business travel",
    body: "Corporate itineraries, conference and trade travel with priority handling and dedicated case officers.",
  },
  {
    title: "Family & group files",
    body: "Coordinated multi-applicant dossiers with shared prerequisite tracking so families move through review together.",
  },
  {
    title: "Medical & long-stay support",
    body: "Sensitive long-stay, treatment and study files prepared with the extra evidence those destinations require.",
  },
];

const PILLARS = [
  { title: "Document checklists", body: "Generated per destination and per traveller, so your files arrive complete the first time." },
  { title: "Embassy workflows", body: "Appointments, submission windows and follow-ups run by our operations team end-to-end." },
  { title: "Live status tracking", body: "Every file moves through a transparent pipeline you and your client can monitor in real time." },
  { title: "Quality review", body: "Experienced visa officers review every dossier before it reaches an embassy counter." },
];

export default async function VisasPage() {
  const ct = contentT(await getUiLocale());
  return (
    <div className="ess-container py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">What we operate</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">{ct("Visa services for professional partners")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        {ct("ESSAFARIA runs complete visa operations for travel agencies, wholesalers and tour operators: document preparation, embassy workflows and transparent tracking — all through one partner platform.")}
      </p>

      <section className="mt-10">
        <h2 className="border-b border-slate-200 pb-2 font-serif text-xl text-navy-900">{ct("Services we deliver")}</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SERVICE_LINES.map((s) => (
            <div key={s.title} className="card p-6">
              <h3 className="font-serif text-lg text-navy-900">{ct(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{ct(s.body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="border-b border-slate-200 pb-2 font-serif text-xl text-navy-900">
          {ct("What working with us looks like")}
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="card p-5">
              <h3 className="text-sm font-semibold text-navy-900">{ct(p.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{ct(p.body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 card bg-navy-900 !text-white">
        <div className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl">{ct("Catalogue access is reserved for partner agencies.")}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Current programmes, processing times and partner pricing are maintained by our operations team and
              served live inside the Agency Portal to authorized partners.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/agency/register" className="btn-cta btn-sm !bg-white !text-navy-900 !border-white">
              Register your Agency
            </Link>
            <Link href="/login" className="btn-secondary btn-sm !bg-transparent !text-white !border-white/40 hover:!bg-white/10">
              Partner sign-in
            </Link>
          </div>
        </div>
      </section>

      <p className="mt-8 text-xs text-slate-400">
        Scoping something unusual for a client? <Link className="text-iris-600 underline" href="/contact">{ct("Talk to our partnerships team")}</Link>.
      </p>
    </div>
  );
}

