import { publicContactDetails } from "@/lib/public-contact";
import type { SiteSettingsMap } from "@/lib/settings";

type Country = {id: string; name: string; iso2: string; active: boolean};
type Programme = {id: string; name: string; nameFr: string | null; nameAr: string | null; countryId: string; categoryId: string; currency: string; fee: string; processingMinDays: number; processingMaxDays: number; active: boolean};
type Category = {id: string; active: boolean};

/** Read-only inventory. Technical completeness is never owner approval. */
export function launchContentReadiness(settings: SiteSettingsMap, legal: Record<string, unknown>, countries: Country[], programmes: Programme[], categories: Category[]) {
  const contact = publicContactDetails(settings);
  const missingContact = (["email", "phone", "address", "officeHours"] as const).filter(key => !contact[key]);
  const missingLegal = (["en","fr","ar"] as const).flatMap(locale => (["terms","privacy"] as const).filter(kind => !legal[`legal.${kind}.${locale}`]).map(kind => `${kind.toUpperCase()} / ${locale.toUpperCase()}`));
  const issues: Array<{id: string; name: string; reasons: string[]}> = [];
  for (const country of countries) {
    const reasons: string[] = [];
    if (/^(türkiye|turkiye|turkey)$/i.test(country.name.trim()) && country.iso2 !== "TR") reasons.push("Country name and ISO code require review");
    if (/\b(test|demo|fixture)\b/i.test(country.name)) reasons.push("Possible test catalogue data");
    if (reasons.length) issues.push({id:country.id,name:`${country.name} / ${country.iso2}`,reasons});
  }
  for (const programme of programmes.filter(p => p.active)) {
    const reasons: string[] = [];
    if (!programme.nameFr?.trim() || !programme.nameAr?.trim()) reasons.push("Missing programme translations");
    if (!countries.some(c => c.id === programme.countryId && c.active)) reasons.push("Unavailable destination");
    if (!categories.some(c => c.id === programme.categoryId && c.active)) reasons.push("Unavailable visa category");
    if (programme.currency !== "DZD" || !Number.isFinite(Number(programme.fee)) || Number(programme.fee) < 0) reasons.push("Review DZD price");
    if (programme.processingMinDays < 0 || programme.processingMaxDays < programme.processingMinDays) reasons.push("Review processing times");
    if (/\b(test|demo|fixture)\b/i.test(programme.name)) reasons.push("Possible test catalogue data");
    if (reasons.length) issues.push({id:programme.id,name:programme.name,reasons});
  }
  return {missingContact, missingLegal, issues};
}
