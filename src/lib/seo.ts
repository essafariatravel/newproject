import type { Metadata, MetadataRoute } from "next";
import type { UiLocale } from "@/lib/ui-i18n";

export const SEO_PRODUCTION_ORIGIN = "https://visa.essafariavoyages.com";
export const SEO_SITE_NAME = "ESSAFARIA";
export const SEO_DEFAULT_OG_IMAGE =
  `${SEO_PRODUCTION_ORIGIN}/images/essafaria-airport-hero.webp`;

export type SeoRuntimeEnv = Pick<NodeJS.ProcessEnv, "VERCEL" | "VERCEL_ENV">;

export type PublicSeoPage =
  | "home"
  | "b2b"
  | "about"
  | "contact"
  | "faq"
  | "privacy"
  | "terms";

const PUBLIC_PATHS: Record<PublicSeoPage, string> = {
  home: "/",
  b2b: "/b2b",
  about: "/about",
  contact: "/contact",
  faq: "/faq",
  privacy: "/privacy",
  terms: "/terms",
};

const PUBLIC_SITEMAP_PAGES = ["home", "b2b", "about", "contact", "faq"] as const;

const OG_LOCALE: Record<UiLocale, string> = {
  en: "en_DZ",
  fr: "fr_DZ",
  ar: "ar_DZ",
};

const PUBLIC_COPY: Record<
  UiLocale,
  Record<PublicSeoPage, { title: string; description: string }>
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
    privacy: {
      title: "Privacy Policy",
      description: "Read the approved ESSAFARIA privacy information.",
    },
    terms: {
      title: "Terms of Service",
      description: "Read the approved ESSAFARIA terms of service.",
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
    privacy: {
      title: "Politique de confidentialité",
      description: "Consultez les informations de confidentialité approuvées d’ESSAFARIA.",
    },
    terms: {
      title: "Conditions d’utilisation",
      description: "Consultez les conditions d’utilisation approuvées d’ESSAFARIA.",
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
    privacy: {
      title: "سياسة الخصوصية",
      description: "اطّلع على معلومات الخصوصية المعتمدة لدى ESSAFARIA.",
    },
    terms: {
      title: "شروط الاستخدام",
      description: "اطّلع على شروط الاستخدام المعتمدة لدى ESSAFARIA.",
    },
  },
};

export function isSearchIndexableEnvironment(
  env: SeoRuntimeEnv = process.env,
): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production";
}

export function publicCanonicalUrl(page: PublicSeoPage): string {
  return new URL(PUBLIC_PATHS[page], SEO_PRODUCTION_ORIGIN).toString();
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
  page: PublicSeoPage,
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
      images: [{ url: SEO_DEFAULT_OG_IMAGE, alt: SEO_SITE_NAME }],
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

  return PUBLIC_SITEMAP_PAGES.map((page) => ({
    url: publicCanonicalUrl(page),
  }));
}

export function buildRobots(
  env: SeoRuntimeEnv = process.env,
): MetadataRoute.Robots {
  if (!isSearchIndexableEnvironment(env)) {
    // Allow crawlers to fetch a non-production page so response/header noindex
    // remains observable. Access protection, not robots.txt, is the security boundary.
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
