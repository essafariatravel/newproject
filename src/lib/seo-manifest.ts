export const SEO_PRODUCTION_ORIGIN = "https://visa.essafariavoyages.com";

export const SEO_PUBLIC_ROUTE_MANIFEST = {
  home: {
    path: "/",
    classification: "indexable",
    sitemap: true,
    headerSource: "/",
    cacheNoStore: false,
    noReferrer: false,
  },
  b2b: {
    path: "/b2b",
    classification: "indexable",
    sitemap: true,
    headerSource: "/b2b",
    cacheNoStore: false,
    noReferrer: false,
  },
  about: {
    path: "/about",
    classification: "indexable",
    sitemap: true,
    headerSource: "/about",
    cacheNoStore: false,
    noReferrer: false,
  },
  contact: {
    path: "/contact",
    classification: "indexable",
    sitemap: true,
    headerSource: "/contact",
    cacheNoStore: false,
    noReferrer: false,
  },
  faq: {
    path: "/faq",
    classification: "indexable",
    sitemap: true,
    headerSource: "/faq",
    cacheNoStore: false,
    noReferrer: false,
  },
  login: {
    path: "/login",
    classification: "noindex",
    sitemap: false,
    headerSource: "/login",
    cacheNoStore: true,
    noReferrer: true,
  },
  forgotPassword: {
    path: "/forgot-password",
    classification: "noindex",
    sitemap: false,
    headerSource: "/forgot-password",
    cacheNoStore: true,
    noReferrer: true,
  },
  changePassword: {
    path: "/change-password",
    classification: "noindex",
    sitemap: false,
    headerSource: "/change-password",
    cacheNoStore: true,
    noReferrer: true,
  },
  agencyRegister: {
    path: "/agency/register",
    classification: "noindex",
    sitemap: false,
    headerSource: "/agency/register",
    cacheNoStore: true,
    noReferrer: false,
  },
  agencyRegisterSuccess: {
    path: "/agency/register/success",
    classification: "noindex",
    sitemap: false,
    headerSource: "/agency/register/success",
    cacheNoStore: true,
    noReferrer: true,
  },
  activate: {
    path: "/activate/[token]",
    classification: "noindex",
    sitemap: false,
    headerSource: "/activate/:path*",
    cacheNoStore: true,
    noReferrer: true,
  },
  agencyVerification: {
    path: "/agency/verification/[token]",
    classification: "noindex",
    sitemap: false,
    headerSource: "/agency/verification/:path*",
    cacheNoStore: true,
    noReferrer: true,
  },
  resetAccess: {
    path: "/reset-access/[token]",
    classification: "noindex",
    sitemap: false,
    headerSource: "/reset-access/:path*",
    cacheNoStore: true,
    noReferrer: true,
  },
  countries: {
    path: "/countries",
    classification: "noindex",
    sitemap: false,
    headerSource: "/countries",
    cacheNoStore: false,
    noReferrer: false,
  },
  visas: {
    path: "/visas",
    classification: "noindex",
    sitemap: false,
    headerSource: "/visas",
    cacheNoStore: false,
    noReferrer: false,
  },
  privacy: {
    path: "/privacy",
    classification: "noindex",
    sitemap: false,
    headerSource: "/privacy",
    cacheNoStore: false,
    noReferrer: false,
  },
  terms: {
    path: "/terms",
    classification: "noindex",
    sitemap: false,
    headerSource: "/terms",
    cacheNoStore: false,
    noReferrer: false,
  },
} as const;

export type SeoPublicRouteKey = keyof typeof SEO_PUBLIC_ROUTE_MANIFEST;

export type IndexablePublicSeoPage = {
  [K in SeoPublicRouteKey]:
    (typeof SEO_PUBLIC_ROUTE_MANIFEST)[K]["classification"] extends "indexable"
      ? K
      : never;
}[SeoPublicRouteKey];

type SeoPublicRouteEntry = {
  [K in SeoPublicRouteKey]: { key: K } & (typeof SEO_PUBLIC_ROUTE_MANIFEST)[K];
}[SeoPublicRouteKey];

type IndexableSeoPublicRouteEntry = Extract<
  SeoPublicRouteEntry,
  { classification: "indexable" }
>;

export const SEO_PUBLIC_ROUTE_ENTRIES = (
  Object.keys(SEO_PUBLIC_ROUTE_MANIFEST) as SeoPublicRouteKey[]
).map(
  (key) => ({ key, ...SEO_PUBLIC_ROUTE_MANIFEST[key] }) as SeoPublicRouteEntry,
);

export const SEO_INDEXABLE_PUBLIC_ENTRIES = SEO_PUBLIC_ROUTE_ENTRIES.filter(
  (entry): entry is IndexableSeoPublicRouteEntry =>
    entry.classification === "indexable",
);

export const SEO_NOINDEX_PUBLIC_ENTRIES = SEO_PUBLIC_ROUTE_ENTRIES.filter(
  (entry): entry is Extract<SeoPublicRouteEntry, { classification: "noindex" }> =>
    entry.classification === "noindex",
);

export const SEO_PRIVATE_ROUTE_PREFIXES = ["/admin", "/portal", "/api"] as const;

export type SeoRuntimeEnv = Pick<NodeJS.ProcessEnv, "VERCEL" | "VERCEL_ENV">;

export function isSearchIndexableEnvironment(
  env: SeoRuntimeEnv = process.env,
): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production";
}

export function seoPublicRoutePath(key: SeoPublicRouteKey): string {
  return SEO_PUBLIC_ROUTE_MANIFEST[key].path;
}
