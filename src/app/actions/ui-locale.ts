"use server";

/**
 * Interface-locale persistence for ALL visitors. Works for anonymous users
 * (cookie) and stays active once signed in — the current architecture has no
 * per-user preferences store, so the cookie is the supported persistence
 * mechanism (same pattern as the trilingual registration flow).
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { pickUiLocale, UI_LOCALE_COOKIE } from "@/lib/ui-i18n";
import { safeLocalRedirectPath } from "@/lib/navigation-security";
import { supportsPublicLanguageQuery } from "@/lib/public-locale";

export async function setUiLocaleAction(formData: FormData): Promise<void> {
  const locale = pickUiLocale(formData.get("locale"));
  if (!locale) return;

  const store = await cookies();
  store.set(UI_LOCALE_COOKIE, locale, {
    httpOnly: false, // non-sensitive UI preference
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  // Redirect back where the visitor came from (Referer), never to an external host.
  let back: string | null = null;
  const next = safeLocalRedirectPath(formData.get("next"));
  if (next) back = next;
  if (!back) {
    try {
      const referer = (await headers()).get("referer") ?? "";
      const url = new URL(referer);
      back = safeLocalRedirectPath(`${url.pathname}${url.search}`);
    } catch {
      back = null;
    }
  }
  const safeBack = safeLocalRedirectPath(back) ?? "/";
  const destination = new URL(safeBack, "https://essafaria.invalid");
  // Next can render the redirect in the action response before the browser
  // sends its new cookie. Carry the chosen language on that request as well.
  if (supportsPublicLanguageQuery(destination.pathname)) {
    destination.searchParams.set("lang", locale);
    redirect(safeLocalRedirectPath(destination.pathname + destination.search + destination.hash) ?? "/");
  }
  redirect(safeBack);
}
