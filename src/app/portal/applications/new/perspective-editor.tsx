"use client";
import {FULL_QUAD,validQuad,type Quad,type Point} from "@/lib/document-geometry";
type Locale="fr"|"en"|"ar";
const copy={
 fr:{title:"Correction de perspective",hint:"Ajustez les quatre coins du document original. Le fichier source reste intact.",reset:"Réinitialiser les coins",invalid:"Coins croisés ou trop rapprochés. Ajustez-les avant de préparer la copie.",labels:["Haut gauche","Haut droite","Bas droite","Bas gauche"],axis:["Horizontal","Vertical"],alt:"Original à recadrer"},
 en:{title:"Perspective correction",hint:"Adjust the four corners of the original document. The source file stays intact.",reset:"Reset corners",invalid:"Corners cross or are too close. Adjust them before preparing the copy.",labels:["Top left","Top right","Bottom right","Bottom left"],axis:["Horizontal","Vertical"],alt:"Original to crop"},
 ar:{title:"تصحيح المنظور",hint:"اضبطوا الزوايا الأربع للوثيقة الأصلية. يبقى الملف الأصلي دون تغيير.",reset:"إعادة ضبط الزوايا",invalid:"الزوايا متقاطعة أو متقاربة جداً. اضبطوها قبل إعداد النسخة.",labels:["أعلى اليسار","أعلى اليمين","أسفل اليمين","أسفل اليسار"],axis:["أفقي","عمودي"],alt:"الأصل المراد قصه"}
} as const;
export function PerspectiveEditor({locale,src,corners,enabled,disabled,onEnabled,onChange}:{locale:Locale;src:string;corners:Quad;enabled:boolean;disabled:boolean;onEnabled:(v:boolean)=>void;onChange:(q:Quad)=>void}){
 const t=copy[locale],valid=validQuad(corners);
 function update(i:number,axis:keyof Point,value:number){const next=[...corners] as [Point,Point,Point,Point];next[i]={...next[i]!,[axis]:value/100};onChange(next)}
 return <div className="di-perspective"><label className="di-confirm"><input type="checkbox" checked={enabled} disabled={disabled} onChange={e=>onEnabled(e.currentTarget.checked)}/>{t.title}</label>
 {enabled?<><small>{t.hint}</small><div className="di-perspective-image" dir="ltr"><img src={src} alt={t.alt}/><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map(p=>p.x*100+","+p.y*100).join(" ")} fill="none" stroke={valid?"#22775b":"#b42318"} strokeWidth="1" vectorEffect="non-scaling-stroke"/>{corners.map((p,i)=><circle key={i} cx={p.x*100} cy={p.y*100} r="1.4" fill="white" stroke="#0b1c30" strokeWidth=".35"/>)}</svg></div>
 <div className="di-corners">{corners.map((p,i)=><fieldset key={i}><legend>{t.labels[i]}</legend>{(["x","y"] as const).map((axis,j)=><label key={axis}>{t.axis[j]} <bdi>{Math.round(p[axis]*100)}%</bdi><input type="range" min={0} max={100} step={1} disabled={disabled} value={Math.round(p[axis]*100)} onChange={e=>update(i,axis,Number(e.currentTarget.value))}/></label>)}</fieldset>)}</div>
 {!valid?<p role="alert" className="di-warning">{t.invalid}</p>:null}<button type="button" className="booking-link" disabled={disabled} onClick={()=>onChange(FULL_QUAD)}>{t.reset}</button></>:null}</div>
}
