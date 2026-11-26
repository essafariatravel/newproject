"use client";
import {DatePicker} from "@/components/date-picker";
import {assessTravelDeadline} from "@/lib/travel-deadline";
import {operationalCopy} from "@/lib/operational-copy";
import {formatProcessingDays} from "@/lib/format";
type Locale="fr"|"en"|"ar";
type Programme={minDays:number;maxDays:number};
const text={
 fr:{placeholder:"JJ/MM/AAAA",plan:"Planifier le départ",optional:"Facultatif",available:"Jours ouvrés disponibles",processing:"Traitement indicatif",method:"Hypothèses de calcul",estimate:"Estimation uniquement, non enregistrée.",date:"Départ prévu",noProgramme:"Choisissez un programme pour estimer le délai.",margin:"Marge indicative"},
 en:{placeholder:"DD/MM/YYYY",plan:"Plan your departure",optional:"Optional",available:"Working days available",processing:"Indicative processing",method:"Calculation assumptions",estimate:"Planning estimate only, not saved.",date:"Planned departure",noProgramme:"Choose a programme to estimate the timing.",margin:"Indicative margin"},
 ar:{placeholder:"DD/MM/YYYY",plan:"التخطيط للسفر",optional:"اختياري",available:"أيام العمل المتاحة",processing:"مدة المعالجة التقديرية",method:"طريقة الحساب",estimate:"تقدير للتخطيط فقط، لا يتم حفظه.",date:"السفر المتوقع",noProgramme:"اختاروا برنامجاً لتقدير المدة.",margin:"الهامش التقديري"}
} as const;
export function departureMax(today:string):string{
 return new Date(Date.parse(today+"T00:00:00Z")+730*86400000).toISOString().slice(0,10);
}
export function TravelDeparture({locale,today,value,onChange,programme,disabled}:{locale:Locale;today:string;value:string;onChange:(value:string)=>void;programme:Programme|null;disabled:boolean}){
 const t=text[locale],copy=operationalCopy[locale],assessment=assessTravelDeadline(value,today,programme?.minDays??0,programme?.maxDays??0);
 return <section className="ops-departure" aria-labelledby="travel-departure-label"><div className="ops-departure-heading"><label id="travel-departure-label" htmlFor="travel-departure">{t.plan}</label><span>{t.optional}</span></div>
 <DatePicker id="travel-departure" name="travelDepartureEstimate" locale={locale} displayDayFirst defaultValue={value} todayValue={today} min={today} max={departureMax(today)} placeholder={t.placeholder} ariaLabel={copy.date} disabled={disabled} invalid={assessment.state==="invalid"} onValueChange={onChange}/>
 {value&&programme?<TravelTiming locale={locale} value={value} today={today} programme={programme}/>:value&&assessment.state==="invalid"?<p className="ops-departure-error" role="status">{copy.invalid}</p>:<small>{value?t.noProgramme:t.estimate}</small>}
 </section>
}
export function TravelTiming({locale,value,today,programme,onEdit}:{locale:Locale;value:string;today:string;programme:Programme|null;onEdit?:()=>void}){
 const t=text[locale],copy=operationalCopy[locale],a=assessTravelDeadline(value,today,programme?.minDays??0,programme?.maxDays??0);
 if(a.state==="none")return null;
 const fmt=new Intl.NumberFormat(locale),day=a.calendarDays===null?value:new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",year:"numeric",timeZone:"UTC",calendar:"gregory"}).format(new Date(value+"T00:00:00Z"));
 return <div className="ops-deadline" data-state={a.state} role="status">
 {onEdit?<div className="ops-trip-heading"><strong>{t.date} · <bdi>{day}</bdi></strong><button type="button" className="booking-link" onClick={onEdit}>{copy.edit}</button></div>:null}
 <div className="ops-timing-status"><span aria-hidden="true" className="ops-status-dot"/><strong>{copy[a.state]}</strong></div>
 {a.workingDays!==null?<div className="ops-timing-grid"><div><span>{t.available}</span><strong><bdi>{fmt.format(a.workingDays)}</bdi></strong><small><bdi>{fmt.format(a.calendarDays!)}</bdi> · {copy.calendar}</small></div><div><span>{t.processing}</span><strong><bdi>{programme?formatProcessingDays(programme.minDays,programme.maxDays,locale):"—"}</bdi></strong>{a.buffer!==null?<small>{t.margin}: <bdi>{a.buffer>0?"+":""}{fmt.format(a.buffer)}</bdi></small>:null}</div></div>:null}
 <div className="ops-timing-foot"><small>{t.estimate}</small><details><summary>{t.method}</summary><p>{copy.basis}</p></details></div></div>
}
