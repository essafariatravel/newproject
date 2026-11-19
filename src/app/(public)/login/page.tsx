import { redirect } from "next/navigation";
import { PremiumLoginShell } from "@/components/premium-login-shell";
import { premiumLoginCopy } from "@/lib/premium-login-copy";
import "../../premium-login.css";
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
  const copy = premiumLoginCopy[locale];
  const notices = new URLSearchParams();
  if (sp.reason === "session-expired") notices.set("reason", "session-expired");
  if (sp.reset === "complete") notices.set("reset", "complete");

  return (
    <PremiumLoginShell
      locale={locale}
      logoUrl={brandLogoUrl(branding)}
      brandName={branding.name}
      returnPath={notices.size ? `/login?${notices}` : "/login"}
      registerLabel={ct("Register your agency")}
      disclosure={ct("Access is restricted to authorized users. All activity is logged and audited.")}
    >
      {notices.has("reason") && <p role="status" className="premium-notice">{ct("Your session has expired. Sign in again to continue.")}</p>}
      {notices.has("reset") && <p role="status" className="premium-notice" data-tone="success">{ct("Your password has been updated. Sign in with your new password.")}</p>}
      <LoginForm
        locale={locale}
        botConfig={publicTurnstileConfig()}
        copy={{
          email: copy.email,
          emailExample: copy.emailExample,
          password: ct("Password"),
          signIn: ct("Sign in"),
          signingIn: `${ct("Signing in")}…`,
          footer: copy.caption,
          forgotPassword: it("Forgot password?"),
          showPassword: ct("Show"),
          hidePassword: ct("Hide"),
        }}
      />
    </PremiumLoginShell>
  );
}
