"use client";
import { ErrorView } from "@/components/error-view";
import { useClientLocale } from "@/lib/client-locale";
export default function ErrorBoundary({retry}: {error: Error & {digest?:string}; retry: () => void}) {
  return <ErrorView locale={useClientLocale()} retry={retry} />;
}
