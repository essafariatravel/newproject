"use client";
import {useState,useId,useRef} from "react";
import Link from "next/link";
type Locale="fr"|"en"|"ar";
type Editorial={id:string;label:string;title:string;body:string;cta:string;href:string;image?:string};
const words={fr:{news:"Actualités ESSAFARIA",previous:"Annonce précédente",next:"Annonce suivante",hide:"Masquer les actualités",show:"Afficher les actualités",slide:"Annonce"},en:{news:"ESSAFARIA updates",previous:"Previous announcement",next:"Next announcement",hide:"Hide updates",show:"Show updates",slide:"Announcement"},ar:{news:"مستجدات ESSAFARIA",previous:"الإعلان السابق",next:"الإعلان التالي",hide:"إخفاء المستجدات",show:"عرض المستجدات",slide:"إعلان"}};
function EditorialIcon({name}:{name:"previous"|"next"|"close"|"arrow"|"plus"}){
 return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==="previous"?<path d="m14.5 6-6 6 6 6"/>:name==="next"?<path d="m9.5 6 6 6-6 6"/>:name==="close"?<path d="m7 7 10 10M17 7 7 17"/>:name==="plus"?<path d="M12 6v12M6 12h12"/>:<path d="M4 12h15m-6-6 6 6-6 6"/>}</svg>;
}
export function HomeEditorial({locale,items}:{locale:Locale;items:Editorial[]}){
 const t=words[locale],id=useId(),[index,setIndex]=useState(0),[hidden,setHidden]=useState(false);
 const restore=useRef<HTMLButtonElement>(null),hide=useRef<HTMLButtonElement>(null),focusAfterChange=useRef(false);
 if(!items.length)return null;
 const current=index%items.length,item=items[current]!;
 function toggle(value:boolean){focusAfterChange.current=true;setHidden(value)}
 if(hidden)return <div className="home-news-collapsed"><button ref={node=>{restore.current=node;if(node&&focusAfterChange.current){node.focus({preventScroll:true});focusAfterChange.current=false}}} type="button" onClick={()=>toggle(false)}>{t.show}<EditorialIcon name="plus"/></button></div>;
 return <section className="home-news home-news-glass" aria-label={t.news} data-kind={item.image?"photo":"editorial"}>
 <div className="home-news-art" aria-hidden="true" key={item.id}>{item.image?<>{/* Local campaign image; no remote asset. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image} alt="" decoding="async" /></>:null}</div>
 <div className="home-news-main" id={id} aria-live="polite"><div key={item.id} className="home-news-content"><span className="home-news-kicker">{item.label}</span><h2>{item.title}</h2><p>{item.body}</p></div></div>
 <Link className="home-news-cta" href={item.href}>{item.cta}<EditorialIcon name="arrow"/></Link>
 <div className="home-news-controls" role="group" aria-label={t.news}>{items.length>1?<><button type="button" aria-label={t.previous} aria-controls={id} onClick={()=>setIndex(v=>(v-1+items.length)%items.length)}><EditorialIcon name="previous"/></button><span className="home-news-dots" aria-label={`${t.slide} ${current+1} / ${items.length}`}>{items.map((slide,i)=><span key={slide.id} className="home-news-dot" data-current={i===current} aria-hidden="true"/>)}</span><button type="button" aria-label={t.next} aria-controls={id} onClick={()=>setIndex(v=>(v+1)%items.length)}><EditorialIcon name="next"/></button></>:null}<button ref={node=>{hide.current=node;if(node&&focusAfterChange.current){node.focus({preventScroll:true});focusAfterChange.current=false}}} className="home-news-hide" type="button" aria-label={t.hide} title={t.hide} onClick={()=>toggle(true)}><EditorialIcon name="close"/></button></div>
 </section>
}
