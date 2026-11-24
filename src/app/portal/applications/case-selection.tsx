"use client";
import {createContext,useContext,useState,type ReactNode} from "react";
import {csvCell} from "./case-workspace";
type Row={id:string;reference:string;traveller:string;country:string;visa:string;status:string;fee:string;updated:string};
type Locale="fr"|"en"|"ar";
const labels={fr:{select:"Sélectionner",all:"Sélectionner la page",selected:"sélectionnés",export:"Exporter CSV",clear:"Effacer",headers:["Référence","Voyageur","Destination","Visa","Statut","Frais DZD","Dernière activité"]},en:{select:"Select",all:"Select page",selected:"selected",export:"Export CSV",clear:"Clear",headers:["Reference","Traveller","Destination","Visa","Status","Fee DZD","Last activity"]},ar:{select:"تحديد",all:"تحديد الصفحة",selected:"محدد",export:"تصدير CSV",clear:"مسح",headers:["المرجع","المسافر","الوجهة","التأشيرة","الحالة","الرسوم","آخر نشاط"]}};
const C=createContext<{rows:Row[];selected:Set<string>;set:(ids:Set<string>)=>void;locale:Locale}>({rows:[],selected:new Set(),set:()=>{},locale:"en"});
export function CaseSelectionProvider({rows,locale,children}:{rows:Row[];locale:Locale;children:ReactNode}){const [selected,set]=useState<Set<string>>(new Set());return <C.Provider value={{rows,selected,set,locale}}>{children}</C.Provider>}
export function CaseSelect({id,reference}:{id:string;reference:string}){const {selected,set,locale}=useContext(C);return <input type="checkbox" className="case-select" aria-label={labels[locale].select+" "+reference} checked={selected.has(id)} onChange={e=>{const next=new Set(selected);if(e.target.checked)next.add(id);else next.delete(id);set(next)}}/>}
export function CaseSelectAll(){const {rows,selected,set,locale}=useContext(C);return <input type="checkbox" className="case-select" aria-label={labels[locale].all} checked={rows.length>0&&rows.every(r=>selected.has(r.id))} onChange={e=>set(e.target.checked?new Set(rows.map(r=>r.id)):new Set())}/>}
export function CaseSelectionToolbar(){const {rows,selected,set,locale}=useContext(C),t=labels[locale];if(!selected.size)return null;
 function exportCsv(){const content=[t.headers,...rows.filter(r=>selected.has(r.id)).map(r=>[r.reference,r.traveller,r.country,r.visa,r.status,r.fee,r.updated])].map(r=>r.map(csvCell).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob(["\uFEFF",content],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="essafaria-dossiers.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <div className="case-selection-toolbar"><span aria-live="polite">{selected.size} {t.selected}</span><button className="btn-secondary btn-sm" type="button" onClick={exportCsv}>{t.export}</button><button type="button" className="case-reset" onClick={()=>set(new Set())}>{t.clear}</button></div>
}
