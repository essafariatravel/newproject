import { getSiteSettings, settingObject, settingString } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact — ESSAFARIA TRAVEL" };

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const email = settingString(settings, "site.contactEmail");
  const phone = settingString(settings, "site.contactPhone");
  const address = settingString(settings, "site.address");
  const hours = settingString(settings, "site.officeHours");
  const social = settingObject(settings, "site.social");

  return (
    <div className="ess-container max-w-4xl py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">Get in touch</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">Contact ESSAFARIA</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Agencies already partnering with us can reach their case officers directly through the agency
        portal. For partnership enquiries and general questions, use the channels below.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Email</h2>
          <a href={`mailto:${email}`} className="mt-1 block font-serif text-lg text-navy-900 hover:text-navy-700">
            {email}
          </a>
          <p className="mt-2 text-xs text-slate-500">Partnership, operations and billing enquiries.</p>
        </div>
        <div className="card p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Phone</h2>
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-1 block font-serif text-lg text-navy-900 hover:text-navy-700">
            {phone}
          </a>
          <p className="mt-2 text-xs text-slate-500">{hours}</p>
        </div>
        <div className="card p-6 sm:col-span-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Office</h2>
          <p className="mt-1 font-serif text-lg text-navy-900">{address}</p>
        </div>
      </div>

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
