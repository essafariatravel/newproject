/**
 * Generalized interface locales (site chrome: header, footer, portal/admin
 * navigation). Minimal dictionary model following the repository's existing
 * locale approach (cookie + optional ?lang= query override) — no new
 * dependency, static-render friendly.
 *
 * Cookies are the default persistence store (works for anonymous visitors);
 * the architecture has no per-user preference column today, so user-level
 * persistence reuses the same cookie once signed in.
 */
import { cookies } from "next/headers";

export const UI_LOCALES = ["en", "fr", "ar"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const UI_LOCALE_COOKIE = "evos_ui_locale";
export const DEFAULT_UI_LOCALE: UiLocale = "en";

export const UI_LOCALE_NAMES: Record<UiLocale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

/** Normalise any raw value to a supported interface locale (or null). */
export function pickUiLocale(v: unknown): UiLocale | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return (UI_LOCALES as readonly string[]).includes(s) ? (s as UiLocale) : null;
}

export function getUiLocaleFromSearch(sp: Record<string, unknown> | undefined): UiLocale | null {
  if (!sp) return null;
  return pickUiLocale(sp.lang);
}

export function isUiRtl(locale: UiLocale): boolean {
  return locale === "ar";
}

/** The current interface locale: ?lang= wins, then the cookie, then EN. */
export async function getUiLocale(search?: Record<string, unknown>): Promise<UiLocale> {
  const viaQuery = getUiLocaleFromSearch(search);
  if (viaQuery) return viaQuery;
  const store = await cookies();
  return pickUiLocale(store.get(UI_LOCALE_COOKIE)?.value) ?? DEFAULT_UI_LOCALE;
}

/* ------------------------------------------------------------------ */
/* Chrome dictionary (keyed by the EN source string)                   */
/* ------------------------------------------------------------------ */

type ChromeKey =
  /* public header + footer */
  | "Home" | "Visa Services" | "Destinations" | "B2B Services" | "For Agencies" | "About" | "Contact"
  | "Sign in" | "Register your agency" | "B2B travel" | "Partner-only" | "Skip to content"
  | "Sign out" | "Language" | "All rights reserved." | "Platform" | "Company"
  | "Menu" | "Close menu"
  /* shell chrome */
  | "Back Office" | "Agency Portal" | "B2B Agency Portal"
  | "Search" | "Search…"
  /* nav sections */
  | "Overview" | "Operations" | "Partners" | "Finance" | "Configuration" | "Insights"
  /* nav items */
  | "Dashboard" | "Notifications" | "Applications" | "New Application" | "Applicants"
  | "Documents" | "Communications" | "Profile" | "Wallet & Transactions"
  | "Agency Registrations" | "Agencies" | "Users" | "Wallets & Billing"
  | "Countries" | "Visa Categories" | "Visa Types" | "Document Types" | "Currencies"
  | "Statuses & Transitions" | "Priorities" | "Reports" | "Audit Logs" | "Settings";

type ChromeDict = Record<ChromeKey, string>;

const FR: ChromeDict = {
  Home: "Accueil",
  "Visa Services": "Services de visas",
  Destinations: "Destinations",
  "B2B Services": "Services B2B",
  "For Agencies": "Pour les agences",
  About: "À propos",
  Contact: "Contact",
  "Sign in": "Se connecter",
  "Register your agency": "Enregistrer votre agence",
  "B2B travel": "Voyage B2B",
  "Partner-only": "Réservé aux partenaires",
  "Skip to content": "Aller au contenu",
  "Sign out": "Se déconnecter",
  Menu: "Menu",
  "Close menu": "Fermer le menu",
  Language: "Langue",
  "All rights reserved.": "Tous droits réservés.",
  Platform: "Plateforme",
  Company: "Société",
  "Back Office": "Back Office",
  "Agency Portal": "Portail Agence",
  "B2B Agency Portal": "Portail Agence B2B",
  Search: "Rechercher",
  "Search…": "Rechercher…",
  Overview: "Vue d'ensemble",
  Operations: "Opérations",
  Partners: "Partenaires",
  Finance: "Finance",
  Configuration: "Configuration",
  Insights: "Pilotage",
  Dashboard: "Tableau de bord",
  Notifications: "Notifications",
  Applications: "Dossiers",
  "New Application": "Nouvelle demande",
  Applicants: "Voyageurs",
  Documents: "Documents",
  Communications: "Communications",
  Profile: "Profil",
  "Wallet & Transactions": "Portefeuille & transactions",
  "Agency Registrations": "Inscriptions d'agences",
  Agencies: "Agences",
  Users: "Utilisateurs",
  "Wallets & Billing": "Portefeuilles & facturation",
  Countries: "Pays",
  "Visa Categories": "Catégories de visas",
  "Visa Types": "Types de visas",
  "Document Types": "Types de documents",
  Currencies: "Devises",
  "Statuses & Transitions": "Statuts & transitions",
  Priorities: "Priorités",
  Reports: "Rapports",
  "Audit Logs": "Journaux d'audit",
  Settings: "Paramètres",
};

const AR: ChromeDict = {
  Home: "الرئيسية",
  "Visa Services": "خدمات التأشيرات",
  Destinations: "الوجهات",
  "B2B Services": "خدمات الشركات",
  "For Agencies": "للوكالات",
  About: "من نحن",
  Contact: "اتصل بنا",
  "Sign in": "تسجيل الدخول",
  "Register your agency": "سجّل وكالتك",
  "B2B travel": "سفر للشركات",
  "Partner-only": "للشركاء فقط",
  "Skip to content": "تخطَّ إلى المحتوى",
  "Sign out": "تسجيل الخروج",
  Menu: "القائمة",
  "Close menu": "إغلاق القائمة",
  Language: "اللغة",
  "All rights reserved.": "جميع الحقوق محفوظة.",
  Platform: "المنصة",
  Company: "الشركة",
  "Back Office": "المكتب الخلفي",
  "Agency Portal": "بوابة الوكالة",
  "B2B Agency Portal": "بوابة الوكالات (B2B)",
  Search: "بحث",
  "Search…": "بحث…",
  Overview: "نظرة عامة",
  Operations: "العمليات",
  Partners: "الشركاء",
  Finance: "المالية",
  Configuration: "الإعدادات",
  Insights: "الرؤى والتقارير",
  Dashboard: "لوحة التحكم",
  Notifications: "الإشعارات",
  Applications: "الطلبات",
  "New Application": "طلب جديد",
  Applicants: "مقدمو الطلبات",
  Documents: "المستندات",
  Communications: "المراسلات",
  Profile: "الملف الشخصي",
  "Wallet & Transactions": "المحفظة والمعاملات",
  "Agency Registrations": "تسجيلات الوكالات",
  Agencies: "الوكالات",
  Users: "المستخدمون",
  "Wallets & Billing": "المحافظ والفوترة",
  Countries: "البلدان",
  "Visa Categories": "فئات التأشيرات",
  "Visa Types": "أنواع التأشيرات",
  "Document Types": "أنواع المستندات",
  Currencies: "العملات",
  "Statuses & Transitions": "الحالات والانتقالات",
  Priorities: "الأولويات",
  Reports: "التقارير",
  "Audit Logs": "سجلات التدقيق",
  Settings: "الإعدادات",
};

const DICTS: Record<UiLocale, Partial<ChromeDict>> = { en: {}, fr: FR, ar: AR };

/** Translate a chrome string for the active locale (EN passes through). */
export function chromeT(locale: UiLocale): (s: string) => string {
  const dict = DICTS[locale];
  return (s: string) => (locale === "en" ? s : (dict[s as ChromeKey] ?? s));
}

/** True when the locale dictionary carries an explicit translation for a key. */
export function chromeHas(locale: UiLocale, key: string): boolean {
  if (locale === "en") return ALL_CHROME_KEYS.includes(key as ChromeKey);
  return key in (DICTS[locale] ?? {});
}

/** Every key a switcher-capable shell renders must exist in every dict. */
export const ALL_CHROME_KEYS: ChromeKey[] = [
  "Home", "Visa Services", "Destinations", "B2B Services", "For Agencies", "About", "Contact",
  "Sign in", "Register your agency", "B2B travel", "Partner-only", "Skip to content",
  "Sign out", "Language", "All rights reserved.", "Platform", "Company",
  "Menu", "Close menu",
  "Back Office", "Agency Portal", "B2B Agency Portal",
  "Search", "Search…",
  "Overview", "Operations", "Partners", "Finance", "Configuration", "Insights",
  "Dashboard", "Notifications", "Applications", "New Application", "Applicants",
  "Documents", "Communications", "Profile", "Wallet & Transactions",
  "Agency Registrations", "Agencies", "Users", "Wallets & Billing",
  "Countries", "Visa Categories", "Visa Types", "Document Types", "Currencies",
  "Statuses & Transitions", "Priorities", "Reports", "Audit Logs", "Settings",
];

/* ------------------------------------------------------------------ */
/* Workflow status + decision labels (config-driven codes, EN/FR/AR)  */
/* ------------------------------------------------------------------ */

/**
 * Stable canonical status codes carry localized display labels here (the
 * architecture stores config-driven codes; display localization lives in this
 * module instead of DB columns — user-entered/configured names untouched).
 */
const STATUS_LABELS: Record<string, Record<UiLocale, string>> = {
  // canonical default workflow (Phase 2.2)
  DRAFT: { en: "Draft", fr: "Brouillon", ar: "مسودة" },
  SUBMITTED: { en: "Submitted", fr: "Soumis", ar: "مقدَّم" },
  DOCUMENTS_CHECKING: { en: "Documents Checking", fr: "Vérification des documents", ar: "فحص المستندات" },
  DOCUMENTS_REQUESTED: { en: "Documents Requested", fr: "Documents demandés", ar: "مستندات مطلوبة" },
  IN_PROCESS: { en: "In Process", fr: "En cours", ar: "قيد المعالجة" },
  EMBASSY_SENT: { en: "Sent to Embassy", fr: "Envoyé à l'ambassade", ar: "أُرسل إلى السفارة" },
  APPROVED: { en: "Approved", fr: "Approuvé", ar: "مقبول" },
  REJECTED: { en: "Rejected", fr: "Refusé", ar: "مرفوض" },
  CANCELLED: { en: "Cancelled", fr: "Annulé", ar: "ملغى" },
  // legacy (deactivated) — preserved so historical records stay readable
  UNDER_REVIEW: { en: "Under Review (legacy)", fr: "En cours d'examen (hérité)", ar: "قيد المراجعة (قديم)" },
  DOCUMENTS_REQUIRED: { en: "Documents Required (legacy)", fr: "Documents requis (hérité)", ar: "مستندات مطلوبة (قديم)" },
  PROCESSING: { en: "Processing (legacy)", fr: "En traitement (hérité)", ar: "قيد المعالجة (قديم)" },
  EMBASSY_SUBMISSION: { en: "Embassy Submission (legacy)", fr: "Déposé à l'ambassade (hérité)", ar: "مقدَّم للسفارة (قديم)" },
  AWAITING_DECISION: { en: "Awaiting Decision (legacy)", fr: "En attente de décision (hérité)", ar: "بانتظار القرار (قديم)" },
  REFUSED: { en: "Rejected (legacy)", fr: "Refusé (héritage)", ar: "مرفوض (قديم)" },
  COMPLETED: { en: "Completed (legacy)", fr: "Terminé (hérité)", ar: "مكتمل (قديم)" },
};

/**
 * Localized status label by stable code.
 * Resolution: configured DB label for the locale (name_fr / name_ar when set)
 * → canonical dictionary → the EN/DB display name. Codes, never translated
 * labels, drive all business logic.
 */
export function localizedStatusName(
  code: string,
  dbName: string,
  locale: UiLocale,
  dbLabelFr?: string | null,
  dbLabelAr?: string | null,
): string {
  if (locale === "fr" && dbLabelFr?.trim()) return dbLabelFr;
  if (locale === "ar" && dbLabelAr?.trim()) return dbLabelAr;
  return STATUS_LABELS[code]?.[locale] ?? dbName;
}

const DECISION_DOC_TYPE_LABELS: Record<string, Record<UiLocale, string>> = {
  DECISION_VISA_APPROVAL: {
    en: "Issued Visa / Approval Decision",
    fr: "Visa délivré / Décision d'approbation",
    ar: "التأشيرة الصادرة / قرار الموافقة",
  },
  DECISION_REFUSAL_LETTER: {
    en: "Refusal / Rejection Decision Letter",
    fr: "Lettre de refus / Décision de refus",
    ar: "خطاب الرفض / قرار الرفض",
  },
};

/** Localized decision-document-type label by code; unknown codes keep DB name. */
export function localizedDocTypeName(code: string, dbName: string, locale: UiLocale): string {
  return DECISION_DOC_TYPE_LABELS[code]?.[locale] ?? dbName;
}

const DOC_STATUS_LABELS: Record<string, Record<UiLocale, string>> = {
  UPLOADED: { en: "Uploaded", fr: "Téléversé", ar: "مرفوع" },
  UNDER_REVIEW: { en: "Under Review", fr: "En cours d'examen", ar: "قيد المراجعة" },
  ACCEPTED: { en: "Accepted", fr: "Accepté", ar: "مقبول" },
  REJECTED: { en: "Rejected", fr: "Refusé", ar: "مرفوض" },
  RESUBMISSION_REQUIRED: { en: "Resubmission Required", fr: "Nouvelle remise requise", ar: "إعادة الإرسال مطلوبة" },
};

/** Localized document-review status; unknown codes keep the source label. */
export function localizedDocStatus(code: string, locale: UiLocale, fallback: string): string {
  return DOC_STATUS_LABELS[code]?.[locale] ?? fallback;
}

const PRIORITY_LABELS: Record<string, Record<UiLocale, string>> = {
  STANDARD: { en: "Standard", fr: "Standard", ar: "عادي" },
  URGENT: { en: "Urgent", fr: "Urgent", ar: "عاجل" },
};

/** Localized priority label for built-in codes; configured names pass through. */
export function localizedPriority(code: string, dbName: string, locale: UiLocale): string {
  return PRIORITY_LABELS[code]?.[locale] ?? dbName;
}
