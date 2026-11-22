import type { UiLocale } from "@/lib/ui-locale-values";

/** Client-side copy stays in the selected workspace locale; no English fallback text. */
export const SESSION_WARNING_COPY: Record<UiLocale, {
  idleTitle: string;
  idleBody: string;
  absoluteTitle: string;
  absoluteBody: string;
  remaining: string;
  stay: string;
  signOut: string;
  signInAgain: string;
  working: string;
  failure: string;
}> = {
  fr: {
    idleTitle: "Votre session va expirer",
    idleBody: "Pour protéger les dossiers, votre session sera fermée après une période d’inactivité. Enregistrez votre travail ou choisissez « Rester connecté ».",
    absoluteTitle: "Fin de la durée maximale de session",
    absoluteBody: "La durée maximale de connexion approche. Enregistrez votre travail, puis reconnectez-vous pour poursuivre.",
    remaining: "Temps restant",
    stay: "Rester connecté",
    signOut: "Se déconnecter",
    signInAgain: "Se reconnecter",
    working: "Vérification…",
    failure: "Impossible de prolonger la session. Réessayez ou reconnectez-vous.",
  },
  en: {
    idleTitle: "Your session is about to expire",
    idleBody: "To protect your applications, this session will close after inactivity. Save your work or select “Stay signed in”.",
    absoluteTitle: "Maximum session duration reached soon",
    absoluteBody: "Your maximum sign-in duration is almost over. Save your work and sign in again to continue.",
    remaining: "Time remaining",
    stay: "Stay signed in",
    signOut: "Sign out",
    signInAgain: "Sign in again",
    working: "Checking…",
    failure: "Could not extend your session. Try again or sign in again.",
  },
  ar: {
    idleTitle: "ستنتهي جلستك قريبًا",
    idleBody: "لحماية ملفات الطلبات، سيتم تسجيل الخروج بعد فترة من عدم النشاط. احفظ عملك أو اختر «البقاء متصلاً».",
    absoluteTitle: "اقترب انتهاء المدة القصوى للجلسة",
    absoluteBody: "اقترب انتهاء المدة القصوى لتسجيل الدخول. احفظ عملك ثم سجل الدخول مجددًا للمتابعة.",
    remaining: "الوقت المتبقي",
    stay: "البقاء متصلاً",
    signOut: "تسجيل الخروج",
    signInAgain: "تسجيل الدخول مجددًا",
    working: "جارٍ التحقق…",
    failure: "تعذر تمديد الجلسة. حاول مرة أخرى أو سجل الدخول مجددًا.",
  },
};

export function sessionWarningCopy(locale: UiLocale) {
  return SESSION_WARNING_COPY[locale];
}
