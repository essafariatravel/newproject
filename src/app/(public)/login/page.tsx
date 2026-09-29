import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { readBranding, brandLogoUrl, BRANDING_DEFAULTS } from "@/lib/branding";
import BrandMark from "@/components/brand-mark";
import { LoginForm } from "./login-form";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const ct = contentT(await getUiLocale());
  // Already signed in → straight to the right workspace. Never 500 if DB is temporarily unavailable.
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    user = await getSessionUser();
  } catch (err) {
    console.error("[login] getSessionUser failed", err);
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
    console.error("[login] readBranding failed", err);
    branding = BRANDING_DEFAULTS;
  }
  const logoUrl = brandLogoUrl(branding);

  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 bg-navy-950 bg-[url('/images/essafaria-airport-hero.webp')] bg-cover bg-center p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-navy-950/65" />
        <BrandMark className="relative h-10 w-10" src={logoUrl} alt={branding.name} />
        <div className="relative">
          <h2 className="font-serif text-4xl leading-snug text-white">
            {ct("One platform for your entire")}
            <span className="italic text-gold-600"> {ct("visa operation")}</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
            {ct("Agency partners manage applications, documents and wallets. Staff process files from the central Back Office.")}
          </p>
        </div>
        <p className="relative text-xs text-white/65">
          {ct("Access is restricted to authorized users. All activity is logged and audited.")}
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark className="h-12 w-12" src={logoUrl} alt={branding.name} />
          </div>
          <h1 className="font-serif text-2xl text-navy-900">{ct("Sign in")}</h1>
          <p className="mt-1 text-sm text-slate-500">{ct("Agency portal and Back Office access.")}</p>
          <LoginForm
        copy={{
          email: ct("Email"),
          password: ct("Password"),
          signIn: ct("Sign in"),
          signingIn: `${ct("Signing in")}…`,
          footer: ct("Agency access is provisioned. Forgotten credentials? Contact your account manager."),
        }} brandName={branding.name} />
        </div>
      </div>
    </div>
  );
}
