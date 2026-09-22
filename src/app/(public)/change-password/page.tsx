import { pageUserForPasswordChange } from "@/lib/page-auth";
import { flashFrom } from "@/lib/action-helpers";
import { changePasswordAction, logoutAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";
import { Flash } from "@/components/ui";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password" };

/**
 * Phase 2.2 §11 — mandatory first password change. Lives outside the
 * portal/admin shells so it stays reachable while the §11 lock (pageUser()
 * redirect + requireUser() block) seals every other authenticated surface.
 * The action re-verifies the session AND the pending flag server-side, so a
 * manual URL visit by a user with no pending change is harmless.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await pageUserForPasswordChange();
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const cc = chromeT(uiLocale);
  const flash = flashFrom(await searchParams);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-serif text-3xl text-navy-900">{ct("Set your password")}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {ct("For security, you must choose a new password before you can continue.")}
      </p>
      <div className="mt-6">
        <Flash {...flash} />
      </div>
      <form action={changePasswordAction} className="card mt-4 space-y-4 p-6">
        <div>
          <label className="label" htmlFor="cp-current">{ct("Current (temporary) password")}</label>
          <input id="cp-current" name="current" type="password" required minLength={10} className="input" autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="cp-new">{ct("New password")} * ({ct("min 10 characters")})</label>
          <input id="cp-new" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="cp-confirm">{ct("Confirm the new password")}</label>
          <input id="cp-confirm" name="confirm" type="password" required minLength={10} className="input" autoComplete="new-password" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingLabel={ct("Saving…")}>
          {ct("Set password and continue")}
        </SubmitButton>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>{user.email}</span>
        <form action={logoutAction}>
          <button className="text-iris-600 hover:underline">{cc("Sign out")}</button>
        </form>
      </div>
    </div>
  );
}
