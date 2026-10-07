import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { mfaEnrolled } from "@/lib/mfa";
import { MfaForm } from "@/components/mfa-form";
import { buildNoIndexMetadata } from "@/lib/seo";
import { getUiLocale } from "@/lib/ui-i18n";
import { mfaCopy } from "@/lib/security-copy";

export const dynamic="force-dynamic";
export const metadata=buildNoIndexMetadata("Verify staff access");
export default async function MfaPage() {
  const user=await getSessionUser({allowMfaPending:true});
  if(!user)redirect("/login");
  if(user.agencyId)redirect("/portal");
  if(user.mustChangePassword)redirect("/change-password");
  const locale=await getUiLocale();
  return <section className="mx-auto max-w-lg p-6 text-start"><h1 className="mb-4 text-2xl font-semibold">{mfaCopy(locale).title}</h1><MfaForm enrolled={await mfaEnrolled(user.id)} locale={locale} /></section>;
}
