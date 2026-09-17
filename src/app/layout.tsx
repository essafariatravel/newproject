import type { Metadata } from "next";
import "./globals.css";
import { getSiteSettings, settingString } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSiteSettings();
    const brand = settingString(settings, "brand.name", "ESSAFARIA TRAVEL");
    const tagline = settingString(settings, "brand.tagline", "Professional B2B visa processing");
    return {
      title: { default: `${brand} — Visa OS`, template: `%s — ${brand}` },
      description: tagline,
    };
  } catch {
    return {
      title: { default: "ESSAFARIA TRAVEL — Visa OS", template: "%s — ESSAFARIA TRAVEL" },
      description: "Professional B2B visa processing platform",
    };
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
