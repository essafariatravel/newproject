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
import { publicTurnstileConfig } from "@/lib/turnstile-config";
import { AuthAccessShell } from "@/components/auth-access-shell";

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
    <AuthAccessShell
      locale={locale}
      variant="login"
      brandName={branding.name}
      logoUrl={logoUrl}
      title={ct("Sign in")}
      description={ct("Partner access")}
      headingId="login-title"
      homeLabel={ct("Home")}
      alternateLink={{ href: "/agency/register", label: ct("Register your agency") }}
      disclosure={ct("Access is restricted to authorized users. All activity is logged and audited.")}
    >
      {sp.reason === "session-expired" ? <p role="status" className="auth-access-notice">{ct("Your session has expired. Sign in again to continue.")}</p> : null}
      {sp.reset === "complete" ? <p role="status" className="auth-access-notice auth-access-notice--success">{ct("Your password has been updated. Sign in with your new password.")}</p> : null}
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
        }} brandName={branding.name} locale={locale} botConfig={publicTurnstileConfig()} />
    </AuthAccessShell>
  );
}
