import type { UiLocale } from "@/lib/ui-i18n";

/** No account existence or user status is exposed by the shared lockout UI. */
const copy = {
  en: {
    locked: "Too many incorrect sign-in attempts. Access is temporarily locked.",
    remaining: "You can try again in",
    ready: "The waiting period is over. You can try signing in again.",
  },
  fr: {
    locked: "Trop de tentatives de connexion incorrectes. L’accès est temporairement verrouillé.",
    remaining: "Nouvelle tentative possible dans",
    ready: "Le délai est terminé. Vous pouvez réessayer de vous connecter.",
  },
  ar: {
    locked: "محاولات تسجيل دخول غير صحيحة متكررة. تم قفل الوصول مؤقتًا.",
    remaining: "يمكنك المحاولة مجددًا بعد",
    ready: "انتهت مدة الانتظار. يمكنك محاولة تسجيل الدخول مجددًا.",
  },
} as const;

export function loginLockoutCopy(locale: UiLocale) {
  return copy[locale] ?? copy.en;
}
