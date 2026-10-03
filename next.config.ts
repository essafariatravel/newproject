import type { NextConfig } from "next";
import { SEO_NOINDEX_PUBLIC_ENTRIES, isSearchIndexableEnvironment } from "./src/lib/seo-manifest";

const searchIndexableEnvironment = isSearchIndexableEnvironment();

const noIndexHeader = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow, noarchive",
} as const;

const publicNoIndexOnlySources = SEO_NOINDEX_PUBLIC_ENTRIES
  .filter((entry) => !entry.cacheNoStore && !entry.noReferrer)
  .map((entry) => entry.headerSource);

const publicSensitiveNoIndexSources = SEO_NOINDEX_PUBLIC_ENTRIES
  .filter((entry) => entry.cacheNoStore || entry.noReferrer);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  // Individual 2 MB documents plus multipart overhead. The wizard sends files
  // separately so a complete dossier never exceeds the hosting payload limit.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      ...(searchIndexableEnvironment
        ? []
        : [{ source: "/:path*", headers: [noIndexHeader] }]),
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      ...publicNoIndexOnlySources.map((source) => ({
        source,
        headers: [noIndexHeader],
      })),
      ...publicSensitiveNoIndexSources.map((entry) => ({
        source: entry.headerSource,
        headers: [
          noIndexHeader,
          ...(entry.cacheNoStore
            ? [{ key: "Cache-Control", value: "no-store, max-age=0" }]
            : []),
          ...(entry.noReferrer
            ? [{ key: "Referrer-Policy", value: "no-referrer" }]
            : []),
        ],
      })),
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          noIndexHeader,
        ],
      },
      {
        source: "/portal/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          noIndexHeader,
        ],
      },
      {
        source: "/api/:path*",
        headers: [noIndexHeader],
      },
    ];
  },
};

export default nextConfig;
