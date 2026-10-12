import type { Metadata } from "next";
import "./globals.css";
import { getUiLocale, isUiRtl } from "@/lib/ui-i18n";
import { getSiteSettings, settingString } from "@/lib/settings";
import { readBranding, brandingCssOverride } from "@/lib/branding";
import {
  SEO_PRODUCTION_ORIGIN,
  isSearchIndexableEnvironment,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

function rootSeoDefaults(): Pick<Metadata, "metadataBase" | "robots"> {
  return {
    metadataBase: new URL(SEO_PRODUCTION_ORIGIN),
    ...(isSearchIndexableEnvironment()
      ? {}
      : { robots: { index: false, follow: false } }),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSiteSettings();
    const brand = (await readBranding()).name;
    const tagline = settingString(settings, "brand.tagline", "Professional B2B visa processing");
    return {
      ...rootSeoDefaults(),
      title: { default: `${brand} — Visa OS`, template: `%s — ${brand}` },
      description: tagline,
    };
  } catch {
    return {
      ...rootSeoDefaults(),
      title: { default: "ESSAFARIA VISA", template: "%s — ESSAFARIA VISA" },
      description: "Professional B2B visa processing platform",
    };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Branding can fail before the DB exists (first boot/migrations) — fall back to defaults.
  let cssOverride = "";
  try {
    cssOverride = brandingCssOverride(await readBranding());
  } catch {
    cssOverride = "";
  }
  const locale = await getUiLocale();
  return (
    <html lang={locale} dir={isUiRtl(locale) ? "rtl" : "ltr"} data-scroll-behavior="smooth">
      <head>{cssOverride ? <style>{cssOverride}</style> : null}</head>
      <body>{children}</body>
    </html>
  );
}
