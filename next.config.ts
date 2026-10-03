import type { NextConfig } from "next";

const searchIndexableEnvironment =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

const noIndexHeader = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow, noarchive",
} as const;

const authNoIndexSources = [
  "/login",
  "/forgot-password",
  "/change-password",
  "/agency/register",
  "/agency/register/success",
  "/countries",
  "/visas",
  "/privacy",
  "/terms",
];

const tokenNoIndexSources = [
  "/reset-access/:path*",
  "/activate/:path*",
  "/agency/verification/:path*",
];

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
      ...authNoIndexSources.map((source) => ({
        source,
        headers: [noIndexHeader],
      })),
      ...tokenNoIndexSources.map((source) => ({
        source,
        headers: [
          noIndexHeader,
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
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
