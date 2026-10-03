import type { Metadata } from "next";
import "./globals.css";
import { getUiLocale, isUiRtl } from "@/lib/ui-i18n";
import { readBranding, brandingCssOverride } from "@/lib/branding";
import { SEO_PRODUCTION_ORIGIN, isSearchIndexableEnvironment } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SEO_PRODUCTION_ORIGIN),
  title: { default: "ESSAFARIA Visa OS", template: "%s | ESSAFARIA" },
  ...(isSearchIndexableEnvironment()
    ? {}
    : { robots: { index: false, follow: false } }),
};

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
      <head>{cssOverride ? <style dangerouslySetInnerHTML={{ __html: cssOverride }} /> : null}</head>
      <body>{children}</body>
    </html>
  );
}
