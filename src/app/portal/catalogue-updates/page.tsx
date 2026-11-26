import Link from "next/link";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale} from "@/lib/ui-i18n";
import {readCatalogueChanges} from "@/lib/catalogue-changes";
import {operationalCopy} from "@/lib/operational-copy";
import {countryName} from "@/lib/country-names";
import {configName} from "@/lib/config-localization";
import {formatAmount} from "@/lib/format";
import {CountryFlag} from "@/components/country-flag";
export const dynamic="force-dynamic";
export default async function CatalogueUpdates(){
 await portalPageUser();
 const locale=await getUiLocale(),copy=operationalCopy[locale];
 const data=await readCatalogueChanges().catch(()=>null);
 const programmes=new Map((data?.programmes??[]).map(p=>[p.id,p]));
 return <section className="ops-catalogue" dir={locale==="ar"?"rtl":"ltr"}><header><Link href="/portal">{copy.back}</Link><h1>{copy.updates}</h1><p>{copy.history}</p></header>
 {!data?<p role="status">{copy.unavailable}</p>:!data.changes.length?<p role="status">{copy.noUpdates}</p>:<ol>{data.changes.map(change=>{
 const p=programmes.get(change.programmeId);if(!p)return null;
 const value=(v:string|undefined)=>v===undefined?"—":change.kind==="price"?formatAmount(v,"DZD",locale):v+" "+copy.days;
 return <li key={change.id}><CountryFlag iso={p.countryIso2}/><div><strong>{countryName({name:p.countryName,iso2:p.countryIso2},locale)} · {configName(p,locale)}</strong><p>{copy[change.kind]}</p>{change.kind==="price"||change.kind==="duration"?<small><bdi>{value(change.before)}</bdi> → <bdi>{value(change.after)}</bdi></small>:null}<time dateTime={change.at.toISOString()}>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"Africa/Algiers"}).format(change.at)}</time></div><Link href={"/portal/applications/new?destination="+encodeURIComponent(p.countryId)+"&programme="+encodeURIComponent(p.id)}>{configName(p,locale)} <span aria-hidden="true">→</span></Link></li>
 })}</ol>}</section>
}
