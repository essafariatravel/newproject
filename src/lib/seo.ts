import type { Metadata, MetadataRoute } from "next";
import type { UiLocale } from "@/lib/ui-i18n";
import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_PUBLIC_LOCALES,
  SEO_PRODUCTION_ORIGIN,
  isSearchIndexableEnvironment,
  seoLocalizedPublicPath,
  type IndexablePublicSeoPage,
  type SeoRuntimeEnv,
} from "@/lib/seo-manifest";

export {
  SEO_PRODUCTION_ORIGIN,
  isSearchIndexableEnvironment,
  type SeoRuntimeEnv,
} from "@/lib/seo-manifest";

export const SEO_SITE_NAME = "ESSAFARIA";
export const SEO_DEFAULT_OG_IMAGE =
  `${SEO_PRODUCTION_ORIGIN}/images/essafaria-airport-hero.webp`;
export const SEO_DEFAULT_OG_IMAGE_WIDTH = 1916;
export const SEO_DEFAULT_OG_IMAGE_HEIGHT = 821;

// Dates correspond to substantive public content first published on 2026-11-14.
// Omit lastmod where a reliable content-update date is not established.
// Update this allowlist ONLY after verified significant page changes.
const VERIFIED_PUBLIC_LASTMOD: Partial<Record<IndexablePublicSeoPage, string>> = {
  b2b: "2026-11-14",
  about: "2026-11-14",
  faq: "2026-11-14",
};

const OG_LOCALE: Record<UiLocale, string> = {
  en: "en_DZ",
  fr: "fr_DZ",
  ar: "ar_DZ",
};

const PUBLIC_COPY: Record<
  UiLocale,
  Record<IndexablePublicSeoPage, { title: string; description: string }>
> = {
  en: {
    home: {
      title: "B2B Visa & eVisa Platform for Travel Agencies in Algeria",
      description:
        "ESSAFARIA helps travel agencies in Algeria coordinate B2B visa and eVisa requests, documents and case follow-up in a secure partner platform.",
    },
    b2b: {
      title: "B2B Visa & eVisa Services for Travel Agencies in Algeria",
      description:
        "Partner with ESSAFARIA for professional visa and eVisa case coordination, document review and secure follow-up for travel agencies in Algeria.",
    },
    about: {
      title: "About ESSAFARIA TRAVEL in Algeria",
      description:
        "Discover ESSAFARIA TRAVEL, an Algiers-based travel agency supporting professional partners with organized B2B visa operations.",
    },
    contact: {
      title: "Contact ESSAFARIA for B2B Visa Partnerships",
      description:
        "Contact ESSAFARIA in Algiers about travel agency partnerships, professional visa services and access to the secure B2B portal.",
    },
    faq: {
      title: "B2B Visa Services FAQ for Travel Agencies",
      description:
        "Answers for travel agencies in Algeria about becoming an ESSAFARIA partner, account access, visa request workflows and documents.",
    },
  },
  fr: {
    home: {
      title: "Plateforme visa et eVisa B2B pour agences en Algérie",
      description:
        "ESSAFARIA accompagne les agences de voyages en Algérie avec une plateforme visa et eVisa B2B sécurisée : dossiers, documents et suivi des demandes.",
    },
    b2b: {
      title: "Services visa et eVisa B2B pour agences en Algérie",
      description:
        "Partenariat visa et eVisa B2B en Algérie : ESSAFARIA accompagne les agences dans la préparation des dossiers, le contrôle documentaire et le suivi sécurisé.",
    },
    about: {
      title: "ESSAFARIA TRAVEL — Solutions visa B2B à Alger",
      description:
        "Découvrez ESSAFARIA TRAVEL, agence basée à Alger, et son accompagnement professionnel des agences partenaires pour les opérations visa B2B.",
    },
    contact: {
      title: "Contact ESSAFARIA — Partenariats agences en Algérie",
      description:
        "Contactez ESSAFARIA à Alger pour un partenariat agence, l'accès au portail professionnel ou des informations sur les services visa B2B.",
    },
    faq: {
      title: "FAQ visas B2B pour agences de voyages en Algérie",
      description:
        "Réponses aux questions des agences algériennes sur le partenariat ESSAFARIA, l’accès B2B, les dossiers visa et la transmission des documents.",
    },
  },
  ar: {
    home: {
      title: "منصة B2B للتأشيرات الإلكترونية لوكالات السفر في الجزائر",
      description:
        "توفر ESSAFARIA لوكالات السفر في الجزائر منصة B2B آمنة لتنسيق طلبات التأشيرات الإلكترونية والتأشيرات الأخرى ومراجعة الوثائق ومتابعة الملفات.",
    },
    b2b: {
      title: "خدمات التأشيرات الإلكترونية B2B لوكالات السفر في الجزائر",
      description:
        "تعاون مع ESSAFARIA لتنسيق طلبات التأشيرات الإلكترونية والتأشيرات الأخرى لوكالات السفر في الجزائر ومراجعة الوثائق ومتابعة الملفات بأمان.",
    },
    about: {
      title: "عن ESSAFARIA TRAVEL في الجزائر",
      description:
        "تعرّف على ESSAFARIA TRAVEL، وكالة سفر في الجزائر العاصمة تقدم خدمات تأشيرات B2B للشركاء المهنيين.",
    },
    contact: {
      title: "اتصل بـ ESSAFARIA لشراكات وكالات السفر",
      description:
        "تواصل مع ESSAFARIA في الجزائر العاصمة للاستفسار عن شراكات الوكالات وخدمات التأشيرات المهنية والوصول إلى البوابة.",
    },
    faq: {
      title: "أسئلة شائعة عن خدمات التأشيرات B2B في الجزائر",
      description:
        "إجابات لوكالات السفر في الجزائر حول التسجيل كشريك والوصول إلى الحساب وطلبات التأشيرات والوثائق.",
    },
  },
};

export function publicCanonicalUrl(
  page: IndexablePublicSeoPage,
  locale: UiLocale = "en",
): string {
  return new URL(seoLocalizedPublicPath(page, locale), SEO_PRODUCTION_ORIGIN).toString();
}

export function publicLanguageAlternates(page: IndexablePublicSeoPage): Record<string, string> {
  return {
    en: publicCanonicalUrl(page, "en"),
    fr: publicCanonicalUrl(page, "fr"),
    ar: publicCanonicalUrl(page, "ar"),
    "x-default": publicCanonicalUrl(page, "en"),
  };
}

export function buildNoIndexMetadata(
  title: string,
  options: { referrer?: Metadata["referrer"] } = {},
): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
    ...(options.referrer ? { referrer: options.referrer } : {}),
  };
}

export function buildPublicMetadata(
  page: IndexablePublicSeoPage,
  locale: UiLocale,
  env: SeoRuntimeEnv = process.env,
): Metadata {
  const copy = PUBLIC_COPY[locale][page];
  const canonical = publicCanonicalUrl(page, locale);
  const fullTitle = `${copy.title} | ${SEO_SITE_NAME}`;
  const production = isSearchIndexableEnvironment(env);

  return {
    title: copy.title,
    description: copy.description,
    ...(production ? { alternates: { canonical, languages: publicLanguageAlternates(page) } } : {}),
    openGraph: {
      type: "website",
      siteName: SEO_SITE_NAME,
      title: fullTitle,
      description: copy.description,
      locale: OG_LOCALE[locale],
      images: [{
        url: SEO_DEFAULT_OG_IMAGE,
        width: SEO_DEFAULT_OG_IMAGE_WIDTH,
        height: SEO_DEFAULT_OG_IMAGE_HEIGHT,
        alt: `${SEO_SITE_NAME} B2B travel services`,
      }],
      ...(production ? { url: canonical } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: copy.description,
      images: [SEO_DEFAULT_OG_IMAGE],
    },
  };
}

export function buildPublicSitemap(
  env: SeoRuntimeEnv = process.env,
): MetadataRoute.Sitemap {
  if (!isSearchIndexableEnvironment(env)) return [];

  return SEO_INDEXABLE_PUBLIC_ENTRIES
    .filter((entry) => entry.sitemap)
    .flatMap((entry) => {
      const verifiedLastmod = VERIFIED_PUBLIC_LASTMOD[entry.key];
      return SEO_PUBLIC_LOCALES.map((locale) => ({
        url: publicCanonicalUrl(entry.key, locale),
        ...(verifiedLastmod ? { lastModified: verifiedLastmod } : {}),
        alternates: { languages: publicLanguageAlternates(entry.key) },
      }));
    });
}

export function buildRobots(
  env: SeoRuntimeEnv = process.env,
): MetadataRoute.Robots {
  if (!isSearchIndexableEnvironment(env)) {
    // Allow crawling so response-level/page-level noindex remains observable.
    // Authentication and deployment protection are the security boundary.
    return { rules: { userAgent: "*", allow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SEO_PRODUCTION_ORIGIN}/sitemap.xml`,
  };
}

export function buildOrganizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ESSAFARIA TRAVEL",
    url: "https://www.essafariavoyages.com/",
    logo: `${SEO_PRODUCTION_ORIGIN}/images/essafaria-logo.png`,
    sameAs: [
      `${SEO_PRODUCTION_ORIGIN}/`,
      "https://www.instagram.com/essafaria.travel/",
    ],
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Only the approved Production home pages emit the public operator's identity. */
export function publicOrganizationJsonLd(
  page: IndexablePublicSeoPage | undefined,
  env: SeoRuntimeEnv = process.env,
): string | null {
  return page === "home" && isSearchIndexableEnvironment(env)
    ? serializeJsonLd(buildOrganizationJsonLd())
    : null;
}

// Only the approved public pages have localized URLs. Operational screens
// retain the existing cookie-based UI locale and private noindex guarantees.
