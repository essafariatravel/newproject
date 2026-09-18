import { getSiteSettings, settingString } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms of Service — ESSAFARIA TRAVEL" };

export default async function TermsPage() {
  const settings = await getSiteSettings();
  const body = settingString(settings, "legal.terms", "These terms will be published shortly.");
  return (
    <div className="ess-container max-w-3xl py-14">
      <h1 className="font-serif text-3xl text-navy-900">Terms of Service</h1>
      <p className="mt-1 text-xs text-slate-400">
        Last updated {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
      </p>
      <div className="card mt-8 whitespace-pre-line p-8 text-[15px] leading-relaxed text-slate-700">
        {body}
      </div>
    </div>
  );
}
