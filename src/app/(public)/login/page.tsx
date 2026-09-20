import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { readBranding, brandLogoUrl, BRANDING_DEFAULTS } from "@/lib/branding";
import BrandMark from "@/components/brand-mark";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in → straight to the right workspace. Never 500 if DB is temporarily unavailable.
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    user = await getSessionUser();
  } catch (err) {
    console.error("[login] getSessionUser failed", err);
    user = null;
  }
  if (user) redirect(isAgencyRole(user.role) ? "/portal" : "/admin");

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
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line/70 bg-gradient-to-br from-iris-50 via-ivory-50 to-gold-50 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(520px 300px at 90% 6%, rgb(130 144 230 / 0.2), transparent 62%), radial-gradient(420px 260px at 8% 96%, rgb(203 178 135 / 0.2), transparent 58%)",
          }}
        />
        <BrandMark className="relative h-10 w-10" src={logoUrl} alt={branding.name} />
        <div className="relative">
          <h2 className="font-serif text-3xl leading-snug text-navy-900">
            One platform for your entire
            <span className="italic text-gold-600"> visa operation</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
            Agency partners manage applications, documents and wallets. {branding.name} staff process files from
            the central Back Office.
          </p>
        </div>
        <p className="relative text-xs text-slate-400">
          Access is restricted to authorized users. All activity is logged and audited.
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark className="h-12 w-12" src={logoUrl} alt={branding.name} />
          </div>
          <h1 className="font-serif text-2xl text-navy-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Agency portal and Back Office access.</p>
          <LoginForm brandName={branding.name} />
        </div>
      </div>
    </div>
  );
}
