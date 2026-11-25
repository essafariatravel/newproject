import {listAgencyNotifications} from "./agency-notification-center";
import {countryName} from "./country-names";
import {businessLabel} from "./business-labels";
export async function agencyBellEvents(userId:string,agencyId:string,locale:"fr"|"en"|"ar",financial:boolean){
 const options={agencyId,financial:false};
 const [recent,attention]=await Promise.all([listAgencyNotifications(userId,20,"all",options),listAgencyNotifications(userId,3,"action",options)]);
 const unique=new Map([...recent,...attention].map(n=>[n.id,n]));
 return [...unique.values()].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()||b.id.localeCompare(a.id)).map(n=>{
 const wallet=n.type.includes("WALLET")||n.type==="TOPUP_REQUESTED";
 const link=wallet?(financial?"/portal/wallet"+(n.type.includes("TOPUP")?"?tab=recharges":""):null):n.applicationId?(n.type==="MESSAGE_POSTED"?"/portal/communications?thread="+n.applicationId:n.actionRequired||n.type.startsWith("DOCUMENT_")?"/portal/applications/"+n.applicationId+"?tab=documents":"/portal/applications/"+n.applicationId):n.link&&/^\/portal(?:\/|$)/.test(n.link)&&!n.link.includes("..")&&!n.link.includes("\\")?n.link:null;
 return {id:n.id,title:businessLabel(n.type,locale),link,createdAt:n.createdAt.toISOString(),readAt:n.readAt?.toISOString()??null,type:n.type,applicationId:n.applicationId,priority:n.actionRequired,context:[n.travellerName,n.destination?countryName({name:n.destination,iso2:n.countryIso2},locale):null,n.reference].filter(Boolean).join(" · ")};
 });
}
