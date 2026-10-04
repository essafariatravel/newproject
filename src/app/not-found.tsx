import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export default async function NotFound() {
  const locale = await getUiLocale(), ct = contentT(locale);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ivory-50 px-6 text-center">
      <p className="font-serif text-6xl text-navy-900">404</p>
      <p className="text-sm text-slate-500">{ct("The page you are looking for does not exist or you may not have access to it.")}</p>
      <Link href="/" className="btn-primary mt-2">
        {ct("Back to homepage")}
      </Link>
    </div>
  );
}
