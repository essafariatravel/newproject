import Link from "next/link";
import type { Metadata } from "next";
import ActivationForm from "./activation-form";
import { resolveActivation } from "@/lib/registrations";
import { registrationCopy, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Activate your account — ESSAFARIA TRAVEL" };

export default async function ActivateAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  let info = null;
  try {
    info = await resolveActivation(token);
  } catch {
    info = null;
  }
  // Locale: explicit ?lang= wins, then the registration locale of the account.
  const locale = resolveLocale(
    typeof sp.lang === "string" ? sp.lang : (info?.locale ?? undefined),
  );
  const copy = registrationCopy(locale);

  return (
    <div dir={copy.dir} lang={locale} className="ess-container flex flex-col items-center py-16 sm:py-20">
      <div className="card w-full max-w-md overflow-hidden">
        <div className="relative bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-8 py-9 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(360px 180px at 85% -20%, rgb(255 255 255 / 0.12), transparent 60%), radial-gradient(260px 150px at 5% 120%, rgb(203 178 135 / 0.22), transparent 60%)",
            }}
          />
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-400">
            ESSAFARIA VISA OS
          </p>
          <h1 className="relative mt-3 font-serif text-2xl leading-snug text-white">
            {info ? copy.activation.title : copy.activation.invalidTitle}
          </h1>
        </div>

        <div className="px-8 py-7">
          {info ? (
            <>
              <p className="text-sm leading-relaxed text-slate-600">{copy.activation.subtitle}</p>
              <div className="mt-4 rounded-2xl border border-line bg-ivory-50 px-4 py-3 text-sm">
                <p className="font-semibold text-navy-900">{info.name}</p>
                <p className="text-xs text-slate-400">{info.email}</p>
                {info.agencyName ? <p className="mt-1 text-xs text-slate-500">{info.agencyName}</p> : null}
              </div>
              <ActivationForm
                token={token}
                locale={locale}
                copy={copy}
                showLabel={copy.activation.showPassword}
                hideLabel={copy.activation.hidePassword}
              />
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-600">{copy.activation.invalidBody}</p>
              <Link href="/login" className="btn-secondary mt-6 w-full px-5 py-2.5">
                {copy.activation.backToLogin}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
