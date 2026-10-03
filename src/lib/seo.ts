import type { Metadata, MetadataRoute } from "next";
import type { UiLocale } from "@/lib/ui-i18n";
import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_PRODUCTION_ORIGIN,
  isSearchIndexableEnvironment,
  seoPublicRoutePath,
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
      title: "B2B Visa Platform for Travel Agencies",
      description:
        "ESSAFARIA provides travel agencies with a secure B2B platform for visa requests, document handling and operational follow-up.",
    },
    b2b: {
      title: "Visa Services for Travel Agencies",
      description:
        "Discover how travel agencies can work with ESSAFARIA for visa request processing, document handling, account access and support.",
    },
    about: {
      title: "About ESSAFARIA",
      description:
        "Learn about ESSAFARIA and its B2B approach to supporting travel professionals with visa operations and related services.",
    },
    contact: {
      title: "Contact ESSAFARIA",
      description:
        "Contact ESSAFARIA for information about agency partnerships, account access and B2B visa services.",
    },
    faq: {
      title: "Agency FAQ",
      description:
        "Find answers about agency onboarding, account access, visa requests, document requirements and ESSAFARIA support.",
    },
  },
  fr: {
    home: {
      title: "Plateforme visa B2B pour agences de voyages",
      description:
        "ESSAFARIA met à disposition des agences de voyages une plateforme B2B sécurisée pour les demandes de visa, les documents et le suivi opérationnel.",
    },
    b2b: {
      title: "Services visa B2B pour agences de voyages",
      description:
        "Découvrez comment les agences de voyages peuvent travailler avec ESSAFARIA pour le traitement des demandes de visa, la gestion des documents, l’accès au compte et l’assistance.",
    },
    about: {
      title: "À propos d’ESSAFARIA",
      description:
        "Découvrez ESSAFARIA et son approche B2B pour accompagner les professionnels du voyage dans leurs opérations visa et services associés.",
    },
    contact: {
      title: "Contacter ESSAFARIA",
      description:
        "Contactez ESSAFARIA pour toute demande concernant les partenariats agences, l’accès au compte et les services visa B2B.",
    },
    faq: {
      title: "FAQ agences partenaires",
      description:
        "Retrouvez les réponses concernant l’intégration des agences, l’accès au compte, les demandes de visa, les documents et l’assistance ESSAFARIA.",
    },
  },
  ar: {
    home: {
      title: "منصة تأشيرات B2B لوكالات السفر",
      description:
        "توفر ESSAFARIA لوكالات السفر منصة B2B آمنة لإدارة طلبات التأشيرات والوثائق والمتابعة التشغيلية.",
    },
    b2b: {
      title: "خدمات التأشيرات لوكالات السفر",
      description:
        "تعرّف على كيفية عمل وكالات السفر مع ESSAFARIA في معالجة طلبات التأشيرات وإدارة الوثائق والوصول إلى الحساب والدعم.",
    },
    about: {
      title: "عن ESSAFARIA",
      description:
        "تعرّف على ESSAFARIA ونهجها في دعم مهنيي السفر من خلال خدمات B2B لعمليات التأشيرات والخدمات المرتبطة بها.",
    },
    contact: {
      title: "اتصل بـ ESSAFARIA",
      description:
        "تواصل مع ESSAFARIA للاستفسار عن شراكات الوكالات والوصول إلى الحساب وخدمات التأشيرات B2B.",
    },
    faq: {
      title: "الأسئلة الشائعة للوكالات",
      description:
        "اطّلع على الإجابات المتعلقة بانضمام الوكالات والوصول إلى الحساب وطلبات التأشيرات والوثائق ودعم ESSAFARIA.",
    },
  },
};

export function publicCanonicalUrl(page: IndexablePublicSeoPage): string {
  return new URL(seoPublicRoutePath(page), SEO_PRODUCTION_ORIGIN).toString();
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
  const canonical = publicCanonicalUrl(page);
  const fullTitle = `${copy.title} | ${SEO_SITE_NAME}`;
  const production = isSearchIndexableEnvironment(env);

  return {
    title: copy.title,
    description: copy.description,
    ...(production ? { alternates: { canonical } } : {}),
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
    .map((entry) => ({
      url: publicCanonicalUrl(entry.key),
    }));
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
    name: SEO_SITE_NAME,
    url: SEO_PRODUCTION_ORIGIN,
    logo: `${SEO_PRODUCTION_ORIGIN}/images/essafaria-logo.png`,
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// International SEO note:
// the current product locale architecture is cookie/query based rather than
// one stable public URL per locale. Do not emit hreflang until distinct,
// crawlable EN/FR/AR URLs exist; contradictory hreflang would be worse.
