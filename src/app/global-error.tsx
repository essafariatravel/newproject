"use client";
import "./globals.css";
import { ErrorView } from "@/components/error-view";
import { useClientLocale } from "@/lib/client-locale";
export default function GlobalError({retry}: {error: Error & {digest?:string}; retry: () => void}) {
  const locale=useClientLocale();
  return <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}><body><ErrorView locale={locale} retry={retry} /></body></html>;
}
