import Link from "next/link";
import type { Metadata } from "next";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Application received — ESSAFARIA TRAVEL" };

const REFERENCE_RE = /^AGR-\d{4}-[A-Z0-9]{6}$/;

export default async function RegistrationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? (await getUiLocale()));
  const copy = registrationCopy(locale);
  const rawRef = typeof sp.ref === "string" ? sp.ref : null;
  const reference = rawRef && REFERENCE_RE.test(rawRef) ? rawRef : null;

  return (
    <div dir={copy.dir} lang={locale} className="ess-container flex flex-col items-center py-16 sm:py-20">
      <div className="card w-full max-w-2xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-8 py-11 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(420px 200px at 85% -20%, rgb(255 255 255 / 0.12), transparent 60%), radial-gradient(320px 180px at 5% 120%, rgb(203 178 135 / 0.22), transparent 60%)",
            }}
          />
          <div className="relative">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold-500/25 text-3xl text-gold-200 ring-2 ring-gold-300/70 shadow-[0_0_0_6px_rgb(255_255_255/0.06)]">
              ✓
            </span>
            <p className="mt-6 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-gold-200 ring-1 ring-white/20">
              {copy.success.kicker}
            </p>
            <h1 className="mx-auto mt-4 max-w-lg font-serif text-2xl font-semibold leading-snug text-white [text-shadow:0_2px_14px_rgb(0_0_0/0.45)] sm:text-3xl">
              {copy.success.title}
            </h1>
          </div>
        </div>

        <div className="px-8 py-8 sm:px-12">
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">{copy.success.body}</p>

          {reference ? (
            <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-gold-100 bg-gold-50/70 px-5 py-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-700">
                {copy.success.referenceLabel}
              </span>
              <span className="font-mono text-sm font-bold tracking-[0.08em] text-navy-900">{reference}</span>
            </div>
          ) : (
            <p className="mt-6 rounded-2xl border border-line bg-ivory-50 px-5 py-4 text-sm text-slate-600">
              {copy.success.noReference}
            </p>
          )}

          <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {copy.success.nextTitle}
          </h2>
          <ol className="mt-3 space-y-3">
            {copy.success.nextSteps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="font-serif text-base italic leading-snug text-gold-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-relaxed text-slate-600">{step}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line/70 pt-6">
            <Link href="/" className="btn-primary px-5 py-2.5">
              {copy.success.backHome}
            </Link>
            <Link href={`/agency/register?lang=${locale}`} className="text-sm font-medium text-slate-500 hover:text-navy-900">
              {copy.title}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
