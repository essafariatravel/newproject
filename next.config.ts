import type { NextConfig } from "next";
import {
  isSearchIndexableEnvironment,
  SEO_NOINDEX_PUBLIC_ENTRIES,
} from "./src/lib/seo-manifest";

const noIndexHeader = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow, noarchive",
};

// The RC already emits stronger no-store/referrer headers for token and
// password flows. Leave those rules intact rather than generating duplicates.
const explicitlyProtectedPublicSources = new Set([
  "/change-password",
  "/forgot-password",
  "/activate/:path*",
  "/reset-access/:path*",
  "/agency/verification/:path*",
]);

const publicNoIndexHeaders = SEO_NOINDEX_PUBLIC_ENTRIES
  .filter((entry) => !explicitlyProtectedPublicSources.has(entry.headerSource))
  .map((entry) => ({
    source: entry.headerSource,
    headers: [
      ...(entry.cacheNoStore
        ? [{ key: "Cache-Control", value: "private, no-store, max-age=0" }]
        : []),
      ...(entry.noReferrer
        ? [{ key: "Referrer-Policy", value: "no-referrer" }]
        : []),
      noIndexHeader,
    ],
  }));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  // Arena's proxied Live Preview origin is a host under *.e2b.app; allow its
  // dev-only HMR/action origin without widening any production host policy.
  allowedDevOrigins: ["*.e2b.app"],
  // Individual 2 MB documents plus multipart overhead. The wizard sends files
  // separately so a complete dossier never exceeds the hosting payload limit.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Fail closed: only the explicit Vercel Production environment may
          // expose indexable responses. Production app behavior otherwise stays
          // exactly as configured below and in page metadata.
          ...(!isSearchIndexableEnvironment() ? [noIndexHeader] : []),
        ],
      },
      {
        source: "/api/:path*",
        headers: [noIndexHeader],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          noIndexHeader,
        ],
      },
      {
        source: "/portal/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          noIndexHeader,
        ],
      },
      ...publicNoIndexHeaders,
      {
        source: "/change-password",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          noIndexHeader,
        ],
      },
      {
        source: "/forgot-password",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          noIndexHeader,
        ],
      },
      {
        source: "/activate/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          noIndexHeader,
        ],
      },
      {
        source: "/reset-access/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          noIndexHeader,
        ],
      },
      {
        source: "/agency/verification/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          noIndexHeader,
        ],
      },
    ];
  },
};

export default nextConfig;
