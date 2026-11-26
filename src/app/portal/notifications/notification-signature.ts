// Only interpret the exact generated status-change format. Staff notes are never inferred or translated.
export function notificationStatusChange(type:string,title:string,body:string,reference:string|null){
 if(!reference||!["STATUS_CHANGED","APPLICATION_COMPLETED"].includes(type))return null;
 const prefix="Application "+reference+": ";
 if(!title.startsWith(prefix))return null;
 const to=title.slice(prefix.length).trim(), marker=" to "+to+".";
 if(!to||!body.startsWith("Status changed from "))return null;
 const rest=body.slice("Status changed from ".length),at=rest.indexOf(marker);
 if(at<=0)return null;
 const tail=rest.slice(at+marker.length);
 if(tail!==""&&!tail.startsWith(" Note: "))return null;
 const from=rest.slice(0,at).trim();
 return from?{from,to}:null;
}
export function notificationAgeMinutes(created:Date,now:Date):number|null {
 const elapsed=now.getTime()-created.getTime();
 return Number.isFinite(elapsed)&&elapsed>=0?Math.floor(elapsed/60000):null;
}
export const notificationStatusCodes:Record<string,string>={"submitted":"SUBMITTED","draft":"DRAFT","documents checking":"DOCUMENTS_CHECKING","document review":"DOCUMENTS_CHECKING","in process":"IN_PROCESS","sent to embassy":"EMBASSY_SENT","under review":"UNDER_REVIEW","documents required":"DOCUMENTS_REQUIRED","processing":"PROCESSING","embassy submission":"EMBASSY_SUBMISSION","awaiting decision":"AWAITING_DECISION","under review (legacy)":"UNDER_REVIEW","documents required (legacy)":"DOCUMENTS_REQUIRED","processing (legacy)":"PROCESSING","embassy submission (legacy)":"EMBASSY_SUBMISSION","awaiting decision (legacy)":"AWAITING_DECISION","rejected (legacy)":"REFUSED","completed (legacy)":"COMPLETED","documents requested":"DOCUMENTS_REQUESTED","in progress":"IN_PROCESS","approved":"APPROVED","refused":"REFUSED","rejected":"REJECTED","completed":"COMPLETED","cancelled":"CANCELLED"};
