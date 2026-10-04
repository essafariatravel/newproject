import { redirect } from "next/navigation";
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
    <div className="auth-entrance grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-2">
      <div className="auth-story relative hidden flex-col justify-between overflow-hidden border-e border-white/10 bg-navy-950 bg-[url('/images/departure-atelier.webp')] bg-cover bg-center p-8 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-navy-950/65" />
        <img className="relative h-20 w-28 rounded bg-white p-2 object-contain" src={logoUrl ?? "/images/essafaria-logo.png"} alt={branding.name} width="112" height="80" />
        <div className="relative">
          <h2 className="font-serif text-4xl leading-snug text-white">
            {ct("Your travellers. Our shared ambition.")}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
            {ct("A dedicated space for ESSAFARIA agency partners.")}
          </p>
        </div>
        <p className="relative text-xs text-white/65">
          {ct("Partner access")}
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <img className="h-20 w-28 object-contain" src={logoUrl ?? "/images/essafaria-logo.png"} alt={branding.name} width="112" height="80" />
          </div>
          <h1 className="font-serif text-2xl text-navy-900">{ct("Sign in")}</h1>
          <p className="mt-1 text-sm text-slate-500">{ct("Partner access")}</p>
          {sp.reason === "session-expired" ? <p role="status" className="mt-4 border-s-2 border-gold-500 ps-4 text-sm text-slate-600">{ct("Your session has expired. Sign in again to continue.")}</p> : null}
          {sp.reset === "complete" ? <p role="status" className="mt-4 border-s-2 border-emerald-600 ps-4 text-sm text-slate-600">{ct("Your password has been updated. Sign in with your new password.")}</p> : null}
          <LoginForm
        copy={{
          email: it("Username or staff email"),
          password: ct("Password"),
          signIn: ct("Sign in"),
          signingIn: `${ct("Signing in")}…`,
          footer: it("Enter your agency username or your staff professional email."),
          forgotPassword: it("Forgot password?"),
        }} brandName={branding.name} />
        </div>
      </div>
    </div>
  );
}
