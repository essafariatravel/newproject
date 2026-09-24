import type { Metadata } from "next";
import "./globals.css";
import { getUiLocale, isUiRtl } from "@/lib/ui-i18n";
import { getSiteSettings, settingString } from "@/lib/settings";
import { readBranding, brandingCssOverride } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSiteSettings();
    const brand = (await readBranding()).name;
    const tagline = settingString(settings, "brand.tagline", "Professional B2B visa processing");
    return {
      title: { default: `${brand} — Visa OS`, template: `%s — ${brand}` },
      description: tagline,
    };
  } catch {
    return {
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
    <html lang={locale} dir={isUiRtl(locale) ? "rtl" : "ltr"}>
      <head>{cssOverride ? <style dangerouslySetInnerHTML={{ __html: cssOverride }} /> : null}</head>
      <body>{children}</body>
    </html>
  );
}
