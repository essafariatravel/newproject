import type { UiLocale } from "./ui-locale-values";

export const premiumLoginCopy = {
  fr: {
    title: ["Bienvenue", "à bord."],
    introduction: "Connectez-vous à ESSAFARIA VISA OS.",
    back: "Retour au site",
    email: "Adresse e-mail",
    emailExample: "vous@exemple.com",
    caption: "Utilisez l’e-mail associé à votre compte.",
  },
  en: {
    title: ["Welcome", "aboard."],
    introduction: "Sign in to ESSAFARIA VISA OS.",
    back: "Back to website",
    email: "Email address",
    emailExample: "you@example.com",
    caption: "Use the email address associated with your account.",
  },
  ar: {
    title: ["مرحباً", "بعودتكم."],
    introduction: "سجّلوا الدخول إلى مساحة عملكم.",
    back: "العودة إلى الموقع",
    email: "البريد الإلكتروني",
    emailExample: "you@example.com",
    caption: "استخدموا البريد الإلكتروني المسجّل لحسابكم.",
  },
} satisfies Record<UiLocale, {
  title: [string, string];
  introduction: string;
  back: string;
  email: string;
  emailExample: string;
  caption: string;
}>;
