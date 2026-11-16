import type { UiLocale } from "@/lib/ui-i18n";

const copy = {
  en: {
    checking: "Verifying secure access…", retry: "Retry verification", failed: "Security verification could not be completed. Please try again.",
    unavailable: "Security verification is temporarily unavailable. Your details have been kept. Please try again.",
    limited: "Too many attempts. Please wait a few minutes before trying again.",
    expired: "Security verification expired. Please verify again.", noScript: "Enable JavaScript to complete the security verification.", label: "Security verification",
  },
  fr: {
    checking: "Vérification de l’accès sécurisé…", retry: "Relancer la vérification", failed: "La vérification de sécurité a échoué. Veuillez réessayer.",
    unavailable: "La vérification de sécurité est temporairement indisponible. Vos informations ont été conservées. Veuillez réessayer.",
    limited: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
    expired: "La vérification de sécurité a expiré. Veuillez la relancer.", noScript: "Activez JavaScript pour effectuer la vérification de sécurité.", label: "Vérification de sécurité",
  },
  ar: {
    checking: "جارٍ التحقق من أمان الدخول…", retry: "إعادة التحقق", failed: "تعذّر إكمال التحقق الأمني. يرجى المحاولة مجدداً.",
    unavailable: "التحقق الأمني غير متاح مؤقتاً. احتُفظ بالمعلومات التي أدخلتموها. يرجى المحاولة مجدداً.",
    limited: "محاولات كثيرة. انتظروا بضع دقائق قبل المحاولة مجدداً.",
    expired: "انتهت صلاحية التحقق الأمني. يرجى إعادة التحقق.", noScript: "فعّلوا JavaScript لإكمال التحقق الأمني.", label: "التحقق الأمني",
  },
} as const;

export function botProtectionCopy(locale: UiLocale) { return copy[locale]; }

export function botProtectionError(locale: UiLocale, error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  const text = copy[locale];
  if (code === "BOT_INVALID") return text.failed;
  if (code === "BOT_RATE_LIMITED") return text.limited;
  return text.unavailable;
}
