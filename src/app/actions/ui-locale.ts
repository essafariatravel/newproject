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

export async function setUiLocaleAction(formData: FormData): Promise<void> {
  const locale = pickUiLocale(formData.get("locale"));
  if (!locale) return;

  const store = await cookies();
  store.set(UI_LOCALE_COOKIE, locale, {
    httpOnly: false, // cosmetic preference: must also be inspectable client-side
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  // Redirect back where the visitor came from (Referer), never to an external host.
  let back: string | null = null;
  const next = formData.get("next");
  if (typeof next === "string" && next.startsWith("/")) back = next;
  if (!back) {
    try {
      const referer = (await headers()).get("referer") ?? "";
      const url = new URL(referer);
      back = `${url.pathname}${url.search}`;
    } catch {
      back = null;
    }
  }
  redirect(back && back.startsWith("/") ? back : "/");
}
