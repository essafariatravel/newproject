import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact — ESSAFARIA VISA" };

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const ct = contentT(await getUiLocale());
  const { email, phone, address, officeHours, social } = publicContactDetails(settings);
  const hasDetails = Boolean(email || phone || address);

  return (
    <div className="ess-container max-w-4xl py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">{ct("Get in touch")}</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">{ct("Contact ESSAFARIA")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        {ct(hasDetails
          ? "Partner agencies can reach case officers through the portal. For partnership enquiries, use the contact details below."
          : "Partner agencies can reach case officers through the portal. New agencies can apply for partnership online.")}
      </p>

      {hasDetails ? <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {email ? <div className="card p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Email")}</h2>
          <a href={`mailto:${email}`} className="mt-1 block font-serif text-lg text-navy-900 hover:text-navy-700">
            {email}
          </a>
          <p className="mt-2 text-xs text-slate-500">{ct("Partnership, operations and billing enquiries.")}</p>
        </div> : null}
        {phone ? <div className="card p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Phone")}</h2>
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-1 block font-serif text-lg text-navy-900 hover:text-navy-700">
            {phone}
          </a>
          {officeHours ? <p className="mt-2 text-xs text-slate-500">{officeHours}</p> : null}
        </div> : null}
        {address ? <div className="card p-6 sm:col-span-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Office")}</h2>
          <p className="mt-1 font-serif text-lg text-navy-900">{address}</p>
        </div> : null}
      </div> : <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/agency/register" className="btn-gold px-5 py-2.5">{ct("Register your Agency")}</Link>
        <Link href="/login" className="btn-secondary px-5 py-2.5">{ct("Sign in to your portal")}</Link>
      </div>}

      {Object.entries(social).filter(([, url]) => url).length > 0 ? (
        <div className="mt-8 flex gap-4 text-sm">
          {Object.entries(social)
            .filter(([, url]) => url)
            .map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm capitalize">
                {name}
              </a>
            ))}
        </div>
      ) : null}
    </div>
  );
}
