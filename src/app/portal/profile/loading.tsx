import {getUiLocale} from "@/lib/ui-i18n";
import {profileCopy} from "./profile-copy";
import "./profile.css";
export default async function ProfileLoading(){
 const c=profileCopy(await getUiLocale());
 return <div className="agency-profile-r01 profile-skeleton" role="status" aria-busy="true" aria-live="polite"><span className="sr-only">{c.loadingProfile}</span><div aria-hidden="true"><div className="profile-skeleton-line profile-skeleton-heading"/><div className="profile-identity"><div className="profile-skeleton-mark"/><div style={{width:"min(260px, 60%)"}}><div className="profile-skeleton-line" style={{height:20,width:"90%"}}/><div className="profile-skeleton-line" style={{marginTop:10,width:"65%"}}/></div></div><div className="profile-skeleton-tabs">{Array.from({length:5},(_,i)=><span className="profile-skeleton-line" key={i}/>)}</div>{Array.from({length:3},(_,i)=><div className="profile-skeleton-fields" key={i}>{Array.from({length:3},(_,j)=><div key={j}><span className="profile-skeleton-line"/><span className="profile-skeleton-line"/></div>)}</div>)}</div></div>
}
