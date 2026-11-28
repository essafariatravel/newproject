import {countryName} from "@/lib/country-names";
import {NATIONALITIES} from "@/lib/nationalities";
import {TravellerVault} from "../traveller-vault";
import {vaultList,vaultTypes} from "@/lib/traveller-vault";
import {vaultEnabled,passportKey,civilDate} from "@/lib/traveller-hub-policy";
import {vaultCopy} from "@/lib/traveller-vault-copy";
import {TravellerProfileForm} from "../traveller-profile-form";
import Link from "next/link";
import {notFound} from "next/navigation";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale,localizedStatusName,localizedDocTypeName,localizedDocStatus} from "@/lib/ui-i18n";
import {travellerProfile,travellerDocuments} from "@/lib/traveller-hub";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {hubEnabled,expiryState,maskPassport} from "@/lib/traveller-hub-policy";
import {algeriaToday} from "@/lib/travel-deadline";
import {formatDate,bytes} from "@/lib/format";
import {nationalityLabel} from "@/lib/nationalities";
import {hasPermission} from "@/lib/rbac";
export const dynamic="force-dynamic";
export default async function TravellerPage({params}:{params:Promise<{id:string}>}){
 if(!hubEnabled())notFound();const user=await portalPageUser(),locale=await getUiLocale(),t=hubCopy[locale],{id}=await params;
 if(!hasPermission(user,"applicants.view.all"))notFound();
 const profile=await travellerProfile(user,id);if(!profile)notFound();
 const a=profile.anchor,state=expiryState(a.expiry,algeriaToday()),docs=await travellerDocuments(user,profile).catch(()=>null);
 const enabled=vaultEnabled()&&hasPermission(user,"documents.view.all");const vt=vaultCopy[locale];const saved=enabled?await vaultList(user,a.id).catch(()=>null):null;const types=enabled&&hasPermission(user,"documents.upload.own")&&hasPermission(user,"applications.create")?await vaultTypes(user).catch(()=>[]):[];
 return <section className="th-hub" dir={locale==="ar"?"rtl":"ltr"}><Link className="th-back" href="/portal/applicants">‹ {t.back}</Link><header className="th-header"><div><h1>{a.name}</h1><p>{nationalityLabel(a.nationality,locale)} · <bdi>{a.reference}</bdi></p></div><div className="th-header-actions">{hasPermission(user,"applications.create")?<TravellerProfileForm key={a.id+":"+a.version} locale={locale} initial={{id:a.id,version:a.version,name:a.name,nationality:a.nationality,passport:a.passport,expiry:a.expiry,dob:a.dob}}/>:null}{hasPermission(user,"applications.create")?<Link className="btn-primary" href={"/portal/applications/new?traveller="+a.id}>{t.repeat}</Link>:null}</div></header>
 <div className="th-meta"><div><small>{t.passport}</small><strong><bdi>{maskPassport(a.passport)}</bdi></strong></div><div><small>{t.expiry}</small><strong><bdi>{formatDate(a.expiry,locale)}</bdi></strong><span className="th-status" data-state={state}>{state==="valid"?t.valid:state==="renew"?t.renewState:state==="expired"?t.expired:t.unknownState}</span></div><div><small>{t.cases}</small><strong><bdi>{a.case_count}</bdi></strong></div></div>
 {enabled?(saved===null?<p role="alert">{t.unavailable}</p>:<TravellerVault locale={locale} id={a.id} version={a.version} types={types} rows={saved.map(r=>({...r,created_at:r.created_at.toISOString()}))} ready={Boolean(passportKey(a.passport)&&civilDate(a.expiry))} today={algeriaToday()}/>):null}
 <div className="th-columns"><section><h2>{t.history}</h2>{!profile.history.length?<p className="th-note">{t.noHistory}</p>:null}{profile.history.map(r=><Link className="th-history" key={r.id} href={"/portal/applications/"+r.application_id}><div><strong>{countryName({name:r.country_name,iso2:NATIONALITIES.find(n=>n.en.toLowerCase()===r.country_name.toLowerCase())?.code},locale)} · {r.visa_type_name}</strong><small><bdi>{r.reference}</bdi> · {formatDate(r.activity_at,locale)}</small></div><span>{localizedStatusName(r.status_code,r.status_name,locale)} →</span></Link>)}{a.case_count>100?<p className="th-note">{t.partial}</p>:null}<p className="th-note">{t.noRenewal}</p></section>
 <section><h2>{enabled?vt.historical:t.documents}</h2>{docs===null?<p role="alert" className="th-note">{t.unavailable}</p>:docs.length?[...new Set(docs.map(d=>d.type_id))].map(typeId=>{const group=docs.filter(d=>d.type_id===typeId),d=group[0]!;return <article key={d.id} className="th-doc"><div><strong>{localizedDocTypeName(d.code,d.label,locale)}</strong><small className="th-filename"><bdi>{d.filename}</bdi></small><small>{bytes(d.size)} · {formatDate(d.created_at,locale)} · <bdi>{d.reference}</bdi></small><small>{localizedDocStatus(d.status,locale,d.status)} · {d.reusable?t.reuse:t.notReusable}</small></div><a href={"/api/documents/"+d.id} download className="booking-link">{t.download}</a>{group.length>1?<details className="th-version-history"><summary>{vt.history} ({group.length-1})</summary>{group.slice(1).map(x=><div key={x.id} className="th-old-version"><small><bdi>{x.filename} · {x.reference}</bdi></small><a href={"/api/documents/"+x.id} download>{t.download}</a></div>)}</details>:null}</article>}):<p className="th-note">{t.noDocs}</p>}{docs?.length===100?<p className="th-note">{t.docLimit}</p>:null}</section></div>
 {profile.candidates.length?<section className="th-candidates"><h2>{t.candidate}</h2><p className="th-note">{t.candidateNote}</p>{profile.candidates.map(c=><Link className="th-history" key={c.id} href={"/portal/applicants/"+c.id}><div><strong>{c.name}</strong><small><bdi>{c.reference} · {maskPassport(c.passport)}</bdi></small></div><span>{formatDate(c.activity_at,locale)} →</span></Link>)}</section>:null}</section>
}
