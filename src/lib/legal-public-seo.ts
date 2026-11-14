import type { UiLocale } from "@/lib/ui-locale-values";

/** Accurate page summaries only; legal content itself remains database-published. */
export const LEGAL_PUBLIC_DESCRIPTIONS: Record<
  "privacy" | "terms",
  Record<UiLocale, string>
> = {
  privacy: {
    en: "Read the ESSAFARIA VISA OS privacy notice about the handling of personal data in the professional travel agency partner portal.",
    fr: "Consultez l’avis de confidentialité ESSAFARIA VISA OS relatif aux données personnelles dans le portail professionnel des agences de voyages.",
    ar: "اطّلع على إشعار الخصوصية لمنصة ESSAFARIA VISA OS والمعلومات المتعلقة بالبيانات الشخصية داخل البوابة المهنية لوكالات السفر.",
  },
  terms: {
    en: "Read the terms of service governing use of ESSAFARIA VISA OS by partner travel agencies and their authorized users.",
    fr: "Consultez les conditions d’utilisation d’ESSAFARIA VISA OS applicables aux agences de voyages partenaires et à leurs utilisateurs autorisés.",
    ar: "اقرأ شروط استخدام منصة ESSAFARIA VISA OS الخاصة بوكالات السفر الشريكة والمستخدمين المخوّلين لديها.",
  },
};
