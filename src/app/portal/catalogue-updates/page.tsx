import Link from "next/link";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale} from "@/lib/ui-i18n";
import {readCatalogueChanges} from "@/lib/catalogue-changes";
import {operationalCopy} from "@/lib/operational-copy";
import {countryName} from "@/lib/country-names";
import {configName} from "@/lib/config-localization";
import {formatAmount} from "@/lib/format";
import {algeriaToday} from "@/lib/travel-deadline";
import {CatalogueTimeline,type TimelineRow} from "./catalogue-timeline";
export const dynamic="force-dynamic";
export default async function CatalogueUpdates(){
 await portalPageUser();
 const locale=await getUiLocale(),copy=operationalCopy[locale];
 const data=await readCatalogueChanges().catch(()=>null);
 const programmes=new Map((data?.programmes??[]).map(p=>[p.id,p]));
 const rows:TimelineRow[]=[];
 const dateFormat=new Intl.DateTimeFormat(locale,{dateStyle:"long",timeZone:"Africa/Algiers"});
 for(const change of data?.changes??[]){
  const p=programmes.get(change.programmeId);if(!p)continue;
  const value=(v:string|undefined)=>v===undefined?"—":change.kind==="price"?formatAmount(v,"DZD",locale):v+" "+copy.days;
  rows.push({id:change.id,kind:change.kind,country:countryName({name:p.countryName,iso2:p.countryIso2},locale),iso:p.countryIso2??"",programme:configName(p,locale),day:algeriaToday(change.at),dayLabel:dateFormat.format(change.at),before:value(change.before),after:value(change.after),href:"/portal/applications/new?destination="+encodeURIComponent(p.countryId)+"&programme="+encodeURIComponent(p.id)});
 }
 return <section className="ops-catalogue" dir={locale==="ar"?"rtl":"ltr"}>
 <header className="ops-catalogue-header"><Link className="ops-back" href="/portal"><span aria-hidden="true" className="ops-direction">←</span> {copy.back}</Link><h1>{copy.updates}</h1><p>{copy.history}</p></header>
 {!data?<p className="ops-feed-empty" role="status">{copy.unavailable}</p>:<CatalogueTimeline rows={rows} locale={locale}/>}
 </section>
}
