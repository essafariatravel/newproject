import Link from "next/link";
import { getSiteSettings, settingString } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "B2B Partnership — ESSAFARIA TRAVEL" };

const BENEFITS = [
  {
    title: "Dedicated operations desk",
    body: "Qualified case officers handle your files end to end, with named escalation contacts for urgent departures.",
  },
  {
    title: "Wholesale fee structure",
    body: "Partner pricing on every programme in the catalogue, settled transparently through your prepaid wallet.",
  },
  {
    title: "Your branded portal",
    body: "Your team works in a clean, fast portal: applications, checklists, documents, status and billing in one place.",
  },
  {
    title: "Compliance & audit",
    body: "Immutable audit logs on every action — built for agencies that answer to corporate clients and regulators.",
  },
];

export default async function B2BPage() {
  const settings = await getSiteSettings();
  const email = settingString(settings, "site.contactEmail");

  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(680px 320px at 78% 0%, rgb(130 144 230 / 0.2), transparent 62%), radial-gradient(520px 280px at 2% 100%, rgb(203 178 135 / 0.16), transparent 58%)",
          }}
        />
        <div className="ess-container relative py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iris-600">For the travel trade</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight text-navy-900">
            Run your entire visa desk on <span className="italic text-gold-600">ESSAFARIA</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-500">
            Travel agencies, wholesalers, tour operators and corporate travel partners use ESSAFARIA VISA OS
            to submit, track and bill visa applications at scale — with a dedicated processing team behind
            every file.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/agency/register" className="btn-primary px-6 py-3">
              Register your Agency
            </Link>
            <span className="max-w-xs text-xs leading-relaxed text-slate-400">
              Online partnership application — reviewed by ESSAFARIA before any access is activated.
            </span>
          </div>
        </div>
      </section>

      <section className="ess-container py-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="card p-6">
              <h2 className="font-serif text-lg text-navy-900">{b.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="partner" className="border-y border-line/70 bg-white/70">
        <div className="ess-container grid grid-cols-1 gap-10 py-14 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl text-navy-900">How onboarding works</h2>
            <ol className="mt-6 space-y-5">
              {[
                ["Apply online", "Submit your agency details and company documents through the partnership application."],
                ["ESSAFARIA review", "Our team verifies your information and may request additional documents."],
                ["Approval & activation", "On approval, your agency workspace is created and your administrator activates their account securely."],
                ["Fund & operate", "Fund your wallet and submit your first files the same day."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="font-serif text-xl text-gold-500">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{t}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="card flex flex-col justify-center p-8">
            <h2 className="font-serif text-xl text-navy-900">Apply for partnership</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Register your agency online: tell us about your company, markets and volumes, and attach your
              registration documents. Every application is reviewed by ESSAFARIA before any portal access
              is activated — applying does not create an account.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/agency/register" className="btn-gold px-5 py-2.5">
                Register your Agency
              </Link>
              <a href={`mailto:${email}?subject=B2B%20Partnership%20Enquiry`} className="text-sm font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900">
                Email the partnerships team
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Already a partner? <Link href="/login" className="text-navy-700 underline underline-offset-2">Sign in to your portal</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
