import Link from "next/link";
import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? (await getUiLocale()));
  return { title: registrationCopy(locale).metaTitle };
}

export default async function AgencyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Bug 3: ONE global language switcher controls this page — resolve ?lang= first,
  // then the shared ui locale cookie (the registration copy locales match ui locales).
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? (await getUiLocale()));
  const copy = registrationCopy(locale);

  return (
    <div dir={copy.dir} lang={locale}>
      {/* Hero — deep navy premium panel */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(560px 260px at 86% -10%, rgb(255 255 255 / 0.10), transparent 62%), radial-gradient(480px 240px at 2% 110%, rgb(203 178 135 / 0.22), transparent 60%)",
          }}
        />
        <div className="ess-container relative py-14 sm:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
            {copy.kicker}
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[1.12] text-white [text-shadow:0_2px_14px_rgb(4_10_32/0.55)] sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
            {copy.subtitle}
          </p>
        </div>
      </section>

      <section className="ess-container -mt-0 grid grid-cols-1 gap-6 py-12 lg:grid-cols-[0.85fr_1.35fr]">
        {/* Left column — the partnership notice + process */}
        <aside className="space-y-4">
          <div className="card relative overflow-hidden border-gold-100 bg-gradient-to-b from-gold-50/80 to-white p-6">
            <span aria-hidden className="absolute end-5 top-5 font-serif text-3xl italic text-gold-400">
              ✦
            </span>
            <h2 className="font-serif text-lg text-navy-900">{copy.noticeTitle}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{copy.noticeBody}</p>
            <p className="mt-3 border-t border-gold-100 pt-3 text-xs leading-relaxed text-slate-500">
              {copy.reviewNote}
            </p>
          </div>

          <div className="card p-6">
            <h3 className="font-serif text-base text-navy-900">{copy.success.nextTitle}</h3>
            <ol className="mt-4 space-y-4">
              {copy.success.nextSteps.map((step, i) => (
                <li key={step} className="flex gap-3.5">
                  <span className="font-serif text-lg italic leading-none text-gold-500">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-slate-600">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="card flex items-center justify-between gap-3 px-6 py-4">
            <p className="text-sm text-slate-500">{copy.alreadyPartner}</p>
            <Link href="/login" className="btn-secondary btn-sm whitespace-nowrap">
              {copy.signIn}
            </Link>
          </div>
        </aside>

        {/* Right column — the form */}
        <div>
          <RegistrationForm locale={locale} copy={copy} renderedAt={Date.now()} />
        </div>
      </section>
    </div>
  );
}
