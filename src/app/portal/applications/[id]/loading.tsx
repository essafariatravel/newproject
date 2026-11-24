import {getUiLocale} from "@/lib/ui-i18n";
import {contentT} from "@/lib/i18n-content";
import "../cases.css";
import "./dossier.css";
export default async function DossierLoading(){
 const locale=await getUiLocale(),t=contentT(locale);
 return <div className="essafaria-cases dossier-workspace" dir={locale==="ar"?"rtl":"ltr"} role="status" aria-busy="true"><p className="case-loading">{t("Loading your workspace…")}</p><div aria-hidden="true" className="case-loading-shell"><div className="case-skeleton" style={{width:"25%",height:34}}/><div className="case-skeleton" style={{width:"40%"}}/><div className="case-skeleton" style={{width:"45%",height:38}}/><div className="dossier-overview"><div className="dossier-main"><div className="case-skeleton" style={{height:24,width:"35%"}}/><div className="case-skeleton" style={{height:84}}/><div className="case-skeleton" style={{height:60}}/></div><div className="case-loading-shell"><div className="case-skeleton" style={{width:"50%"}}/><div className="case-skeleton" style={{height:100}}/></div></div></div></div>
}
