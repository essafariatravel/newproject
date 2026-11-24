import {getUiLocale} from "@/lib/ui-i18n";
import {contentT} from "@/lib/i18n-content";
import "./cases.css";
export default async function CasesLoading(){
 const locale=await getUiLocale(),t=contentT(locale);
 return <div className="essafaria-cases" dir={locale==="ar"?"rtl":"ltr"} role="status" aria-busy="true"><header className="case-title"><h1>{t("Applications")}</h1></header><p className="case-loading">{t("Loading your workspace…")}</p><div aria-hidden="true" className="case-loading-shell"><div className="case-skeleton" style={{width:"35%"}}/><div className="case-skeleton" style={{height:48}}/>{[0,1,2].map(i=><div key={i} className="case-skeleton-row">{[0,1,2,3,4,5,6].map(j=><span key={j} className="case-skeleton"/>)}</div>)}</div></div>
}
