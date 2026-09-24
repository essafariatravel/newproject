import Link from "next/link";
import { getSiteSettings, settingString } from "@/lib/settings";
import { readBranding } from "@/lib/branding";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function AboutPage() {
  const settings = await getSiteSettings();
  const ct = contentT(await getUiLocale());
  const brandName = (await readBranding()).name;
  const address = settingString(settings, "site.address");

  return (
    <div className="ess-container max-w-4xl py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">{ct("Our company")}</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">{ct("About")} {brandName}</h1>
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-slate-700">
        <p>
          {brandName} {ct("is a professional visa-processing house built for the travel trade. We are not a consumer visa shop: our platform, pricing and service levels are designed for agencies, wholesalers and tour operators that move meaningful passenger volumes and need an operational partner they can hold accountable.")}
        </p>
        <p>
          {ct("Every file on ESSAFARIA VISA OS — our operations platform — follows a controlled workflow: document checklists generated from current embassy rules, review by qualified case officers, controlled status transitions, and a complete audit trail from submission to decision. Agencies see everything their clients ask about: live status, document feedback and billing.")}
        </p>
        <p>
          {ct("We deliberately run a prepaid wallet model: your agency funds its balance once, and application charges are settled automatically against a full ledger. Finance teams get clean reconciliation; operations teams never wait on invoices.")}
        </p>
        <p className="text-slate-500">{ct("Registered office:")} {address}</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          [ct("Operations-first"), ct("Built by visa professionals, for visa professionals — not adapted from generic CRM software.")],
          [ct("Config-driven"), ct("Embassy rule changes are applied centrally; your quotes and checklists stay current.")],
          [ct("Audited by design"), ct("Wallet movements, status changes and document reviews are logged immutably.")],
        ].map(([t, b]) => (
          <div key={t} className="card p-5">
            <h2 className="font-serif text-base text-navy-900">{t}</h2>
            <p className="mt-1.5 text-sm text-slate-600">{b}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <Link href="/b2b#partner" className="btn-primary">
          {ct("Partner with us")} →
        </Link>
      </div>
    </div>
  );
}
