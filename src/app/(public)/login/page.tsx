import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { readBranding, brandLogoUrl, BRANDING_DEFAULTS } from "@/lib/branding";
import { LoginForm } from "./login-form";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { identityT } from "@/lib/identity-copy";
import { safeErrorCode } from "@/lib/safe-error";
import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = buildNoIndexMetadata("Sign in", {
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";

export default async function LoginPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const sp = await searchParams;
  const locale = await getUiLocale(sp), ct = contentT(locale), it = identityT(locale);
  // Already signed in → straight to the right workspace. Never 500 if DB is temporarily unavailable.
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    user = await getSessionUser();
  } catch (err) {
    console.error("[login] getSessionUser failed", safeErrorCode(err) ?? "unknown");
    user = null;
  }
  if (user) {
    if (user.mustChangePassword) redirect("/change-password");
    redirect(isAgencyRole(user.role) ? "/portal" : "/admin");
  }

  let branding: Awaited<ReturnType<typeof readBranding>>;
  try {
    branding = await readBranding();
  } catch (err) {
    console.error("[login] readBranding failed", safeErrorCode(err) ?? "unknown");
    branding = BRANDING_DEFAULTS;
  }
  const logoUrl = brandLogoUrl(branding);

  return (
    <div className="auth-entrance public-access-interior grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-2">
      <div className="auth-story relative hidden flex-col justify-between overflow-hidden border-e border-white/10 bg-navy-950 bg-cover bg-center p-8 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-navy-950/65" />
        <div className="relative auth-story-copy">
          <h2 className="text-white">{ct("The ESSAFARIA visa desk")}</h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">
            {ct("Agency partners manage applications, documents and wallets. Staff process files from the central Back Office.")}
          </p>
        </div>
        <p className="relative text-sm text-white">
          {ct("Ostuni, Italy")}
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <img className="h-20 w-28 object-contain" src={logoUrl ?? "/images/essafaria-logo.png"} alt={branding.name} width="112" height="80" />
          </div>
          <h1 className="font-serif text-2xl text-navy-900">{ct("Sign in")}</h1>
          <p className="mt-1 text-base text-slate-500">{ct("Partner access")}</p>
          {sp.reason === "session-expired" ? <p role="status" className="mt-4 border-s-2 border-gold-500 ps-4 text-base text-slate-600">{ct("Your session has expired. Sign in again to continue.")}</p> : null}
          {sp.reset === "complete" ? <p role="status" className="mt-4 border-s-2 border-emerald-600 ps-4 text-base text-slate-600">{ct("Your password has been updated. Sign in with your new password.")}</p> : null}
          <LoginForm
        copy={{
          email: ct("Email"),
          password: ct("Password"),
          signIn: ct("Sign in"),
          signingIn: `${ct("Signing in")}…`,
          footer: it("Sign in with your registered account email."),
          forgotPassword: it("Forgot password?"),
          showPassword: ct("Show"),
          hidePassword: ct("Hide"),
        }} brandName={branding.name} />
          <p className="auth-partner-link"><Link href="/agency/register">{ct("Register your agency")}</Link></p>
          <p className="text-center text-xs text-slate-600">{ct("Access is restricted to authorized users. All activity is logged and audited.")}</p>
        </div>
      </div>
    </div>
  );
}
