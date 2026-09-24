import Link from "next/link";
import { getSiteSettings, settingString } from "@/lib/settings";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "B2B Partnership — ESSAFARIA TRAVEL" };

const BENEFITS = [
  {
    title: "Dedicated operations desk",
    body: "Case officers handle files through a documented workflow, with direct case communications in the portal.",
  },
  {
    title: "Wholesale fee structure",
    body: "Configured DZD partner fees are shown in the portal and settled through your prepaid wallet.",
  },
  {
    title: "Your branded portal",
    body: "Your team works in a clean, fast portal: applications, checklists, documents, status and billing in one place.",
  },
  {
    title: "Compliance & audit",
    body: "Sensitive operational and financial actions are recorded for traceability.",
  },
];

export default async function B2BPage() {
  const settings = await getSiteSettings();
  const ct = contentT(await getUiLocale());
  const email = settingString(settings, "site.contactEmail");

  return (
    <>
      <section className="relative overflow-hidden bg-navy-900">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, rgb(7 26 51 / .96), rgb(7 26 51 / .72)), url('/images/essafaria-airport-hero.webp') center / cover",
          }}
        />
        <div className="ess-container relative py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-400">{ct("For the travel trade")}</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight text-white">
            {ct("Run your entire visa desk on")} <span className="italic text-gold-600">ESSAFARIA</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/80">
            {ct("Travel agencies, wholesalers, tour operators and corporate travel partners use ESSAFARIA VISA OS to submit, track and bill visa applications at scale — with a dedicated processing team behind every file.")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/agency/register" className="btn-primary px-6 py-3">
              {ct("Register your Agency")}
            </Link>
            <span className="max-w-xs text-xs leading-relaxed text-slate-400">
              {ct("Online partnership application — reviewed by ESSAFARIA before any access is activated.")}
            </span>
          </div>
        </div>
      </section>

      <section className="ess-container py-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="card p-6">
              <h2 className="font-serif text-lg text-navy-900">{ct(b.title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{ct(b.body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="partner" className="border-y border-line/70 bg-white/70">
        <div className="ess-container grid grid-cols-1 gap-10 py-14 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl text-navy-900">{ct("How onboarding works")}</h2>
            <ol className="mt-6 space-y-5">
              {([
                ["Apply online", "Submit your agency details and company documents through the partnership application."],
                ["ESSAFARIA review", "Our team verifies your information and may request additional documents."],
                ["Approval & activation", "On approval, your agency workspace is created and your administrator activates their account securely."],
                ["Fund & operate", "Fund your wallet before submitting visa applications."],
              ] as [string, string][]).map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="font-serif text-xl text-gold-500">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{ct(t)}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{ct(b)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="card flex flex-col justify-center p-8">
            <h2 className="font-serif text-xl text-navy-900">{ct("Apply for partnership")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {ct("Register online with your company details and documents. ESSAFARIA reviews every application before portal access is activated.")}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/agency/register" className="btn-gold px-5 py-2.5">
                {ct("Register your Agency")}
              </Link>
              <a href={`mailto:${email}?subject=B2B%20Partnership%20Enquiry`} className="text-sm font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900">
                {ct("Email the partnerships team")}
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {ct("Already a partner?")} <Link href="/login" className="text-navy-700 underline underline-offset-2">{ct("Sign in to your portal")}</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
