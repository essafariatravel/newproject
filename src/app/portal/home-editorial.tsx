"use client";
import {useState,useId} from "react";
import Link from "next/link";
type Locale="fr"|"en"|"ar";
type Editorial={id:string;label:string;title:string;body:string;cta:string;href:string;image?:string};
const words={fr:{news:"Actualités ESSAFARIA",previous:"Annonce précédente",next:"Annonce suivante",hide:"Masquer les actualités",show:"Afficher les actualités"},en:{news:"ESSAFARIA updates",previous:"Previous announcement",next:"Next announcement",hide:"Hide updates",show:"Show updates"},ar:{news:"مستجدات ESSAFARIA",previous:"الإعلان السابق",next:"الإعلان التالي",hide:"إخفاء المستجدات",show:"عرض المستجدات"}};
export function HomeEditorial({locale,items}:{locale:Locale;items:Editorial[]}){
 const t=words[locale],id=useId(),[index,setIndex]=useState(0),[hidden,setHidden]=useState(false);
 if(!items.length)return null;
 const item=items[index%items.length]!;
 if(hidden)return <div className="home-news-collapsed"><button type="button" onClick={()=>setHidden(false)}>{t.show} <span aria-hidden="true">＋</span></button></div>;
 return <section className="home-news" aria-label={t.news} aria-roledescription={locale==="fr"?"annonces":locale==="ar"?"إعلانات":"announcements"} data-kind={item.image?"photo":"editorial"}>
 <div className="home-news-main" id={id} aria-live="polite"><div key={item.id} className="home-news-content"><span className="home-news-kicker">{item.label}</span><h2>{item.title}</h2><p>{item.body}</p></div><Link className="home-news-cta" href={item.href}>{item.cta}<span aria-hidden="true">→</span></Link></div>
 <div className="home-news-art" aria-hidden="true">{item.image?<img key={item.id} src={item.image} alt="" decoding="async" />:<svg viewBox="0 0 360 150" fill="none" preserveAspectRatio="xMidYMid slice"><path d="M72 150V69L163 0M124 150V88L251 0M181 150v-48L335 0M239 150v-30l121-80" stroke="#7893ad" strokeOpacity=".42" strokeWidth="1.3"/><path d="M0 110h360M0 70h360M0 30h360" stroke="#7893ad" strokeOpacity=".19"/><circle cx="251" cy="0" r="5" fill="#d9e5f0"/><circle cx="124" cy="88" r="4" fill="#d9e5f0"/></svg>}</div>
 <div className="home-news-controls">{items.length>1?<><button type="button" aria-label={t.previous} aria-controls={id} onClick={()=>setIndex(v=>(v-1+items.length)%items.length)}><span aria-hidden="true">‹</span></button><span className="home-news-index" aria-label={`${index%items.length+1} / ${items.length}`}>{String(index%items.length+1).padStart(2,"0")} / {String(items.length).padStart(2,"0")}</span><button type="button" aria-label={t.next} aria-controls={id} onClick={()=>setIndex(v=>(v+1)%items.length)}><span aria-hidden="true">›</span></button></>:null}<button type="button" aria-label={t.hide} title={t.hide} onClick={()=>setHidden(true)}>×</button></div>
 </section>
}
