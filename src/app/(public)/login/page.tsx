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
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seo";
import "./login-sky.css";

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
    <div className="login-sky-screen">
      <div className="login-sky-photo" aria-hidden="true" />
      <div className="login-sky-wash" aria-hidden="true" />
      <div className="login-sky-panel-outer">
        <section className="login-sky-panel" aria-labelledby="login-title">
          <div className="login-sky-brand">
            <img
              className="login-sky-logo"
              src={logoUrl ?? "/images/essafaria-logo.png"}
              alt={branding.name}
              width="128"
              height="91"
            />
            <div className="login-sky-brand-copy" aria-hidden="true">
              <span>ESSAFARIA</span>
              <small>VISA OS</small>
            </div>
          </div>

          <div className="login-sky-intro">
            <h1 id="login-title">{ct("Sign in")}</h1>
            <p>{ct("Partner access")}</p>
          </div>

          {sp.reason === "session-expired" ? (
            <p role="status" className="login-sky-notice login-sky-notice-warning">
              {ct("Your session has expired. Sign in again to continue.")}
            </p>
          ) : null}
          {sp.reset === "complete" ? (
            <p role="status" className="login-sky-notice login-sky-notice-success">
              {ct("Your password has been updated. Sign in with your new password.")}
            </p>
          ) : null}

          <LoginForm
            brandName={branding.name}
            copy={{
              email: ct("Email"),
              password: ct("Password"),
              signIn: ct("Sign in"),
              signingIn: `${ct("Signing in")}…`,
              footer: it("Sign in with your registered account email."),
              forgotPassword: it("Forgot password?"),
              showPassword: ct("Show"),
              hidePassword: ct("Hide"),
            }}
          />

          <div className="login-sky-bottom">
            <div className="login-sky-links">
              <Link href="/">{ct("Home")}</Link>
              <Link href="/agency/register">{ct("Register your agency")}</Link>
            </div>
            <UiLanguageSwitcher locale={locale} nextPath="/login" />
          </div>
        </section>
      </div>
      <p className="login-sky-disclosure">
        {ct("Access is restricted to authorized users. All activity is logged and audited.")}
      </p>
    </div>
  );
}
